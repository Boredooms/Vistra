/**
 * Content script: the same SDK + widget as a website integration, with a Transport that goes through the
 * background worker (no API key or token ever lives in the page). DOM extraction, element picking, multi-page
 * guides and guide resume after full page loads all come from @vistra/sdk-core.
 */
import { Vistra, VistraApiError, mountWidget, type SseMessage, type Transport, type WidgetHandle } from "@vistra/sdk-core";
import { isSensitive, type PortIn, type PortOut } from "./shared";

declare global {
  interface Window { __vistraExt?: { widget: WidgetHandle; vistra: Vistra } }
}

type Pending = { onOut: (m: PortOut) => void };

class PortTransport implements Transport {
  private port: chrome.runtime.Port | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  private connect(): chrome.runtime.Port {
    if (this.port) return this.port;
    const p = chrome.runtime.connect({ name: "vistra" });
    p.onMessage.addListener((m: PortOut) => this.pending.get(m.id)?.onOut(m));
    p.onDisconnect.addListener(() => {
      this.port = null; // service worker restarted: fail in-flight calls, reconnect lazily on the next call
      for (const [id, h] of this.pending) h.onOut({ id, kind: "error", status: 0, code: "NETWORK_ERROR", detail: "Extension worker restarted" });
    });
    this.port = p;
    return p;
  }

  private call(msg: { kind: "request"; path: string; method?: string; body?: unknown } | { kind: "capture" }): Promise<unknown> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        onOut: (m) => {
          this.pending.delete(id);
          if (m.kind === "result") resolve(m.data);
          else if (m.kind === "error") reject(new VistraApiError(m.status, m.code, m.detail));
        },
      });
      this.connect().postMessage({ ...msg, id } as PortIn);
    });
  }

  request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    return this.call({ kind: "request", path, method: init.method, body: init.body }) as Promise<T>;
  }

  async *stream(path: string, body: unknown): AsyncIterable<SseMessage> {
    const id = ++this.seq;
    const queue: PortOut[] = [];
    let wake: (() => void) | null = null;
    this.pending.set(id, { onOut: (m) => { queue.push(m); wake?.(); } });
    this.connect().postMessage({ id, kind: "stream", path, body } satisfies PortIn);
    try {
      for (;;) {
        if (!queue.length) await new Promise<void>((r) => (wake = r));
        wake = null;
        const m = queue.shift()!;
        if (m.kind === "event") yield { event: m.event, data: m.data };
        else if (m.kind === "error") throw new VistraApiError(m.status, m.code, m.detail);
        else if (m.kind === "end") return;
      }
    } finally {
      this.pending.delete(id);
      this.port?.postMessage({ id, kind: "cancel" } satisfies PortIn);
    }
  }

  async captureScreenshot(): Promise<string | null> {
    // hide VISTRA's own UI so the model sees the page, not the assistant
    const ui = [...document.querySelectorAll<HTMLElement>("[data-vistra-ui],[data-vistra-cursor-root]")];
    const prev = ui.map((el) => el.style.visibility);
    ui.forEach((el) => (el.style.visibility = "hidden"));
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    try {
      return (await this.call({ kind: "capture" })) as string | null;
    } finally {
      ui.forEach((el, i) => (el.style.visibility = prev[i] ?? ""));
    }
  }

  close(): void {
    this.port?.disconnect();
    this.port = null;
  }
}

async function main() {
  if (window.__vistraExt || window.top !== window || isSensitive(location.hostname)) return;
  const { config } = await chrome.storage.local.get("config");
  const vistra = Vistra.init({ appId: config?.appId || "unconfigured", transport: new PortTransport() });
  const widget = mountWidget(vistra, {
    title: "VISTRA",
    greeting: `Ask about ${location.hostname}, select anything on the page, or ask me to show you how to do something.`,
    suggestions: ["Explain this page", "What can I do here?", "Select element"].slice(0, 2),
    screenUnderstanding: true,
    runHref: (id) => (config?.dashboardUrl ? `${config.dashboardUrl}/logs?run=${id}` : null),
  });
  window.__vistraExt = { widget, vistra };
  chrome.runtime.onMessage.addListener((msg: { type: string }, _s, reply) => {
    const ext = window.__vistraExt;
    if (!ext) return reply({ ok: false });
    if (msg.type === "open") ext.widget.open();
    if (msg.type === "explain") {
      ext.widget.open();
      ext.vistra.attachScreenshotToNextMessage();
      void ext.widget.ask("Explain this page: what is it for and what can I do here?");
    }
    reply({ ok: true });
  });
}

void main();

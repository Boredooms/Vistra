import { readSse, type SseMessage } from "./sse";
import { VistraApiError, type SessionInfo, type Transport } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Default transport: fetch + SSE from the page to the VISTRA API, with session minting, refresh at 80 % TTL,
 * one transparent re-mint on SESSION_EXPIRED, and exponential backoff (300/900/2700 ms) on network errors.
 * Streams are never retried (a message may already have started a run).
 */
export class HttpTransport implements Transport {
  private session: SessionInfo | null = null;
  private expiresAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private aborters = new Set<AbortController>();
  private minting: Promise<SessionInfo> | null = null;

  constructor(
    private readonly apiUrl: string,
    private readonly getSessionToken: (prev?: SessionInfo) => Promise<SessionInfo>,
    private readonly f: typeof fetch = (...a) => fetch(...a),
    private readonly onSession?: (s: SessionInfo) => void,
  ) {}

  private async token(force = false): Promise<string> {
    if (!force && this.session && Date.now() < this.expiresAt - 5000) return this.session.token;
    if (!this.minting) {
      this.minting = this.getSessionToken(this.session ?? undefined)
        .then((s) => {
          this.session = s;
          this.expiresAt = Date.now() + s.token_ttl * 1000;
          if (this.timer) clearTimeout(this.timer);
          this.timer = setTimeout(() => void this.token(true).catch(() => undefined), s.token_ttl * 800);
          this.onSession?.(s);
          return s;
        })
        .finally(() => { this.minting = null; });
    }
    return (await this.minting).token;
  }

  get sessionId(): string | undefined {
    return this.session?.session_id;
  }

  private async raw(path: string, init: { method?: string; body?: unknown }, retryAuth = true): Promise<Response> {
    const ctrl = new AbortController();
    this.aborters.add(ctrl);
    try {
      let res: Response | undefined;
      for (let attempt = 0; ; attempt++) {
        try {
          res = await this.f(`${this.apiUrl.replace(/\/$/, "")}${path}`, {
            method: init.method ?? "GET",
            signal: ctrl.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${await this.token()}` },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
          });
          break;
        } catch (e) {
          if (ctrl.signal.aborted || attempt >= 2 || init.method === "POST" && path.includes("/messages")) {
            throw VistraApiError.network(e instanceof Error ? e.message : String(e));
          }
          await sleep(300 * 3 ** attempt);
        }
      }
      if (!res.ok) {
        const body = (await res.clone().json().catch(() => ({}))) as { code?: string; detail?: string; title?: string };
        if (retryAuth && res.status === 401 && body.code === "SESSION_EXPIRED") {
          await this.token(true);
          return this.raw(path, init, false);
        }
        throw new VistraApiError(res.status, body.code ?? "HTTP_ERROR", body.detail ?? body.title ?? `HTTP ${res.status}`);
      }
      return res;
    } finally {
      this.aborters.delete(ctrl);
    }
  }

  async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await this.raw(path, init);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async *stream(path: string, body: unknown): AsyncIterable<SseMessage> {
    const res = await this.raw(path, { method: "POST", body });
    if (!res.body) throw new VistraApiError(0, "NO_STREAM", "Response has no body");
    yield* readSse(res.body);
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const a of this.aborters) a.abort();
    this.aborters.clear();
  }
}

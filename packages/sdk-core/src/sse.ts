export interface SseMessage {
  event: string;
  data: unknown;
}

/** Minimal SSE parser over a fetch body (EventSource cannot POST or send an Authorization header). */
export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith(":")) continue; // heartbeat/comment
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).trim());
        }
        if (data.length) {
          try {
            yield { event, data: JSON.parse(data.join("\n")) };
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

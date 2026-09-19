// Shared by every route that runs one agent turn and streams the reply back: request-body
// parsing and the streamed response (see the models in types.ts).
import { OpenClawError, streamAgentReply } from "@/lib/openclaw";
import type { ApiError, ChatEvent, ChatRequest, ReportRequest } from "@/lib/types";

const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_MESSAGE_CHARS = 4000;
const NDJSON = "application/x-ndjson";

type Parsed<T> = { ok: true; value: T } | { ok: false; error: ApiError };

function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID.test(value);
}

export function parseChatRequest(body: unknown): Parsed<ChatRequest> {
  const b = (body ?? {}) as Record<string, unknown>;
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return { ok: false, error: { error: `message is required (max ${MAX_MESSAGE_CHARS} chars)` } };
  }
  if (!isValidSessionId(b.sessionId)) return { ok: false, error: { error: "invalid sessionId" } };
  return { ok: true, value: { message, sessionId: b.sessionId } };
}

export function parseReportRequest(body: unknown): Parsed<ReportRequest> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isValidSessionId(b.sessionId)) return { ok: false, error: { error: "invalid sessionId" } };
  if (b.asOf !== undefined && (typeof b.asOf !== "string" || Number.isNaN(new Date(b.asOf).getTime()))) {
    return { ok: false, error: { error: "asOf must be an ISO timestamp" } };
  }
  return { ok: true, value: { sessionId: b.sessionId, asOf: b.asOf } };
}

/** Text deltas -> NDJSON `ChatEvent`s, always ending in exactly one `done` or `error`. */
function toEventStream(text: ReadableStream<string>, path: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const line = (event: ChatEvent) => encoder.encode(`${JSON.stringify(event)}\n`);
  const reader = text.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(line({ type: "done" }));
          controller.close();
        } else {
          controller.enqueue(line({ type: "text", delta: value }));
        }
      } catch (err) {
        console.error(`[${path}]`, err);
        controller.enqueue(line({ type: "error", error: "agent unavailable" }));
        controller.close();
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
}

/** Runs one agent turn and streams the reply — as `ChatEvent`s if the client asks, else plain text. */
export async function agentResponse(req: Request, message: string, sessionId: string) {
  const path = new URL(req.url).pathname;
  try {
    const stream = await streamAgentReply(message, sessionId, req.signal);
    if (req.headers.get("accept")?.includes(NDJSON)) {
      return new Response(toEventStream(stream, path), {
        headers: { "Content-Type": `${NDJSON}; charset=utf-8`, "Cache-Control": "no-store" },
      });
    }
    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error(`[${path}]`, err);
    const status = err instanceof OpenClawError ? err.status : 502;
    return Response.json({ error: "agent unavailable" } satisfies ApiError, { status });
  }
}

// Shared by every route that runs one agent turn and streams the reply back: request-body
// parsing and the streamed response (see the models in types.ts).
import { ChartSplitter, type Part, chartToMarkdown } from "@/lib/chart-blocks";
import { OpenClawError, streamAgentReply } from "@/lib/openclaw";
import { type ReportFileMeta, buildReportFile } from "@/lib/report-file";
import type { ApiError, ChatEvent, ChatRequest, ContentBlock, ReportRequest } from "@/lib/types";

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

/**
 * Text deltas -> NDJSON `ChatEvent`s: prose as `text`, each complete ```chart fence as a
 * `block`, then (if `file` is given) the exported file as the last block, and finally
 * exactly one `done` or `error`.
 */
function toEventStream(text: ReadableStream<string>, path: string, file?: ReportFileMeta): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const line = (event: ChatEvent) => encoder.encode(`${JSON.stringify(event)}\n`);
  const reader = text.getReader();
  const splitter = new ChartSplitter();
  const blocks: ContentBlock[] = []; // the reply so far, for the exported file

  const toEvents = (parts: Part[]): ChatEvent[] =>
    parts.map((part): ChatEvent => {
      if (part.type === "chart") {
        blocks.push(part.block);
        return { type: "block", block: part.block };
      }
      const last = blocks.at(-1);
      if (last?.type === "markdown") last.text += part.delta;
      else blocks.push({ type: "markdown", text: part.delta });
      return { type: "text", delta: part.delta };
    });

  return new ReadableStream<Uint8Array>({
    // Loops until it enqueues: the splitter can hold text back (a possible fence opener), and
    // a pull that enqueues nothing would never be called again.
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          const events = toEvents(done ? splitter.end() : splitter.push(value));
          for (const event of events) controller.enqueue(line(event));
          if (done) {
            if (file) controller.enqueue(line({ type: "block", block: { type: "file", file: buildReportFile(file, blocks) } }));
            controller.enqueue(line({ type: "done" }));
            controller.close();
            return;
          }
          if (events.length) return;
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

/** Plain-text mode has no blocks, so charts are rendered as markdown tables in the text. */
function toPlainStream(text: ReadableStream<string>): ReadableStream<Uint8Array> {
  const splitter = new ChartSplitter();
  const render = (parts: Part[]) => parts.map((p) => (p.type === "text" ? p.delta : chartToMarkdown(p.block))).join("");
  return text
    .pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          const out = render(splitter.push(chunk));
          if (out) controller.enqueue(out);
        },
        flush(controller) {
          const out = render(splitter.end());
          if (out) controller.enqueue(out);
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());
}

/**
 * Runs one agent turn and streams the reply — as `ChatEvent`s if the client asks for them,
 * else as plain text. `options.file` (reports only) attaches the export as the last block of
 * the event stream; plain-text mode has no way to carry a file.
 */
export async function agentResponse(
  req: Request,
  message: string,
  sessionId: string,
  options: { file?: ReportFileMeta } = {},
) {
  const path = new URL(req.url).pathname;
  try {
    const stream = await streamAgentReply(message, sessionId, req.signal);
    if (req.headers.get("accept")?.includes(NDJSON)) {
      return new Response(toEventStream(stream, path, options.file), {
        headers: { "Content-Type": `${NDJSON}; charset=utf-8`, "Cache-Control": "no-store" },
      });
    }
    return new Response(toPlainStream(stream), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error(`[${path}]`, err);
    const status = err instanceof OpenClawError ? err.status : 502;
    return Response.json({ error: "agent unavailable" } satisfies ApiError, { status });
  }
}

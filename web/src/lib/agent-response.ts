// Shared by every route that runs one agent turn and streams the reply back: request-body
// parsing and the streamed response (see the models in types.ts).
import { ChartSplitter, type Part, chartToMarkdown } from "@/lib/chart-blocks";
import { OpenClawError, streamAgentReply } from "@/lib/openclaw";
import { type ReportFileMeta, buildReportFile } from "@/lib/report-file";
import { saveReport } from "@/lib/report-store";
import { type ResolvedTenant, UnknownTenantError, resolveTenant } from "@/lib/tenant";
import type { Anomaly, ApiError, ChatEvent, ChatRequest, ContentBlock, ReportKind, ReportRequest } from "@/lib/types";

const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_MESSAGE_CHARS = 4000;
const NDJSON = "application/x-ndjson";

type Parsed<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/** Shared by the API routes and the `/chat/[sessionId]` page, so a URL and a request agree. */
export function isValidSessionId(value: unknown): value is string {
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

/** Drains a text stream into the same block list `toEventStream` builds, but batched (no
 * incremental delivery) — for `recordReport` below, which needs the whole reply, not a feed. */
async function collectBlocks(text: ReadableStream<string>): Promise<ContentBlock[]> {
  const splitter = new ChartSplitter();
  const blocks: ContentBlock[] = [];
  const push = (parts: Part[]) => {
    for (const part of parts) {
      if (part.type === "chart") {
        blocks.push(part.block);
        continue;
      }
      const last = blocks.at(-1);
      if (last?.type === "markdown") last.text += part.delta;
      else blocks.push({ type: "markdown", text: part.delta });
    }
  };
  const reader = text.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    push(done ? splitter.end() : splitter.push(value));
    if (done) return blocks;
  }
}

export type ReportMeta = {
  kind: ReportKind;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  partial: boolean;
  anomalies?: Anomaly[];
};

/** Persists the report once its stream finishes, independent of how (or whether) the client
 * read it — same FileRef a `ChatEvent`-mode client would get, via the same buildReportFile. */
async function recordReport(
  path: string,
  tenantId: string,
  sessionId: string,
  meta: ReportMeta,
  text: ReadableStream<string>,
  fileMeta?: ReportFileMeta,
): Promise<void> {
  try {
    const blocks = await collectBlocks(text);
    const file = fileMeta ? buildReportFile(fileMeta, blocks) : undefined;
    await saveReport(tenantId, { ...meta, sessionId, generatedAt: new Date(), blocks, file });
  } catch (err) {
    console.error(`[${path}] report persistence failed`, err);
  }
}

/** Runs one report turn with nobody reading it and saves the result — the scheduler's path
 * (auto-reports.ts). Resolves once the report is saved, or once saving has failed and been logged. */
export async function generateReport(
  tenant: ResolvedTenant,
  message: string,
  sessionId: string,
  meta: ReportMeta,
  fileMeta?: ReportFileMeta,
): Promise<void> {
  const path = `auto-report:${meta.kind}`;
  const text = await streamAgentReply(message, sessionId, tenant.tenantId, tenant.modules);
  await recordReport(path, tenant.tenantId, sessionId, meta, text, fileMeta);
}

/**
 * Resolves the tenant (`x-tenant-id` header, see tenant.ts), then runs one agent turn and
 * streams the reply — as `ChatEvent`s if the client asks for them, else as plain text.
 * `options.file` (reports only) attaches the export as the last block of the event stream;
 * plain-text mode has no way to carry a file. `options.report` (reports only) additionally
 * persists the finished reply via report-store.ts, regardless of which encoding the client
 * used — the UI still only ever reads the response it asked for.
 */
export async function agentResponse(
  req: Request,
  message: string,
  sessionId: string,
  options: { file?: ReportFileMeta; report?: ReportMeta } = {},
) {
  const path = new URL(req.url).pathname;

  let tenant: ResolvedTenant;
  try {
    tenant = await resolveTenant(req);
  } catch (err) {
    if (err instanceof UnknownTenantError) {
      return Response.json({ error: "unknown tenant" } satisfies ApiError, { status: 404 });
    }
    console.error(`[${path}] tenant resolution failed`, err);
    return Response.json({ error: "tenant lookup unavailable" } satisfies ApiError, { status: 502 });
  }

  try {
    // Reports must finish generating (and get persisted) even if the browser tab closes
    // mid-reply — so, unlike chat, don't tie the upstream call to the client's abort signal:
    // req.signal aborts the one shared fetch behind both tee() branches, not just the
    // client-facing one, and a disconnect shouldn't be able to kill a report mid-save.
    const agentStream = await streamAgentReply(
      message,
      sessionId,
      tenant.tenantId,
      tenant.modules,
      options.report ? undefined : req.signal,
    );
    const [stream, forStorage] = options.report ? agentStream.tee() : [agentStream, undefined];
    if (forStorage && options.report) {
      // Fire-and-forget: this is a long-lived container process, not a serverless function
      // torn down at response time, so the recording finishes even though the response
      // doesn't wait on it — a slow write must never delay the reply the user is reading.
      recordReport(path, tenant.tenantId, sessionId, options.report, forStorage, options.file);
    }
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

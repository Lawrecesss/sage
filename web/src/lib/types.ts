// Brief-JSON + Signal types — mirror the generated JSON Schema in data/schemas/entities/.
// STUB — structure only, no implementation yet.

// --- Chat API: POST /api/chat and POST /api/reports/[name] ---

/**
 * Request body for POST /api/chat. `message` is trimmed, 1–4000 chars. The tenant is not in
 * the body: it comes from the `x-tenant-id` header (or DEFAULT_TENANT_ID) — see tenant.ts.
 */
export type ChatRequest = {
  message: string;
  /** Conversation key — OpenClaw keeps history per session. 8–64 chars of [A-Za-z0-9-]. */
  sessionId: string;
};

/** Request body for POST /api/reports/[name]. The prompt is built server-side; tenant as in ChatRequest. */
export type ReportRequest = {
  sessionId: string;
  /** ISO timestamp pinning "now" (replay against the frozen dataset). Defaults to the real clock. */
  asOf?: string;
};

/**
 * Success response of both routes, streamed as the agent generates it. Two encodings of the
 * same reply, chosen by the request's `Accept` header:
 * - `Accept: application/x-ndjson` -> `application/x-ndjson`: one `ChatEvent` JSON per line.
 * - otherwise -> `text/plain; charset=utf-8`: just the reply text, no events (what chat.tsx
 *   reads today; it cannot carry charts, tables or files).
 */
export type ChatResponse = ReadableStream<Uint8Array>;

/**
 * JSON body of every non-2xx response from these routes: 400 bad input, 404 unknown report or
 * unknown tenant, 502 tenant lookup or agent unavailable.
 */
export type ApiError = { error: string };

// --- Rich responses: text, charts, tables, files, saved reports ---
//
// The model for the agent chat and the Reports page: `ChatEvent` is what the routes stream
// (see ChatResponse). Free-form chat and the prebuilt report buttons share these shapes — a
// report is just a reply that was saved. Today the routes emit `text`, chart `block`s (parsed
// from the agent's ```chart fences — see chart-blocks.ts), a file `block` at the end of a
// report, and `done` / `error`. `done.report` and table blocks arrive with report storage.

/** Flat rows so a chart library and a sheet-style table can both consume the same data. */
export type DataRow = Record<string, string | number | null>;

export type ChartKind = "line" | "bar" | "area" | "pie";

export type ChartSpec = {
  kind: ChartKind;
  /** Column of `data` on the x axis (pie: the slice label). */
  xKey: string;
  /** One entry per plotted column of `data` (pie: exactly one). */
  series: { key: string; label: string }[];
  data: DataRow[];
  /** Unit of the plotted values, e.g. "SGD", "pct", "days". */
  unit?: string;
  xLabel?: string;
  yLabel?: string;
};

/**
 * A portable file attached to a reply. Whether to download it is the user's call — the UI
 * just offers the link. Reports attach their markdown export as the last block of the reply.
 */
export type FileFormat = "md" | "pdf" | "csv" | "png";

export type FileRef = {
  id: string;
  name: string;
  format: FileFormat;
  mimeType: string;
  sizeBytes: number;
  /**
   * Where to view or download it. Today a `data:` URL carrying the whole file (no storage
   * yet); once reports are stored, an app-relative path. Either works as an `<a href download>`.
   */
  url: string;
};

/** What a reply is made of, in display order. Markdown is the default; the rest are structured. */
export type MarkdownBlock = { type: "markdown"; text: string };
export type ChartBlock = { type: "chart"; title: string; caption?: string; chart: ChartSpec };
export type TableBlock = {
  type: "table";
  title?: string;
  columns: { key: string; label: string; unit?: string }[];
  rows: DataRow[];
};
export type FileBlock = { type: "file"; file: FileRef };
export type ContentBlock = MarkdownBlock | ChartBlock | TableBlock | FileBlock;

/** The prebuilt reports — the same names as the commands in commands.ts. */
export type ReportKind =
  | "morning-brief"
  | "afternoon-report"
  | "evening-report"
  | "daily-report"
  | "weekly-report";

/** One row of the Reports page (the sheet view): enough to list, sort and open without the body. */
export type ReportSummary = {
  id: string;
  kind: ReportKind;
  title: string;
  /** ISO timestamps. */
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  /** True if the window was still running when generated (covers it "so far"). */
  partial: boolean;
  /** One-line takeaway, shown in the list. */
  headline?: string;
  /** Exports of this report (md, pdf, ...). */
  files: FileRef[];
};

/** A saved report, opened from the Reports page. */
export type Report = ReportSummary & { blocks: ContentBlock[] };

/**
 * One event of the streamed chat reply (newline-delimited JSON, one event per line). `text`
 * deltas append to the trailing markdown block; a `block` event ends it and adds a complete
 * chart / table / file after it. The stream always ends with exactly one `done` or `error`;
 * a prebuilt report's `done` carries the saved report so the UI can link to it.
 */
export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "block"; block: Exclude<ContentBlock, MarkdownBlock> }
  | { type: "done"; report?: ReportSummary }
  | { type: "error"; error: string };

/** One turn as the UI holds it. History lives server-side in OpenClaw, so this is never sent. */
export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; blocks: ContentBlock[]; report?: ReportSummary };

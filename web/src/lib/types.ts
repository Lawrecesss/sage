// Frontend contracts. These mirror shapes owned by other lanes — change them together:
//   Signal       ← mcp/src/sage_mcp/demo_data.py (future `signals` table)
//   Metric       ← metrics.yaml (governed metric layer, served by MCP list_metrics)
//   CausalStep   ← data/simulator/src/sage_simulator/incidents/schema.py
//   Brief        ← brief-JSON contract with the agent lane (future `briefings` table)
// Snake_case field names match the wire/DB format on purpose; don't camelCase them.

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

/**
 * Request body for POST /api/chat/title -> `{ title: string }`. The browser holds the
 * transcript (lib/chat-history.ts), so it sends a condensed copy: plain text per turn.
 */
export type ChatTitleRequest = {
  sessionId: string;
  transcript: { role: "user" | "assistant"; text: string }[];
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

/** The prebuilt reports — the same names as the commands in commands.ts. "six-hour-report"
 * is the one the scheduler (lib/auto-reports.ts) runs by itself every 6 hours. */
export type ReportKind =
  | "morning-brief"
  | "afternoon-report"
  | "evening-report"
  | "daily-report"
  | "weekly-report"
  | "six-hour-report";

/** One SKU's gross (non-refund) revenue in the anomaly scan's current and previous periods. */
export type AnomalyItem = {
  sku: string;
  name: string;
  category: string;
  /** SGD. */
  current: number;
  previous: number;
  /** Fractional: 0.42 = +42%. Null when there were no previous sales to compare against. */
  change: number | null;
};

/**
 * Something the pre-report scan (lib/anomalies.ts) flagged, handed to the agent to explain and
 * saved with the report. `divergence` is the "A is up while B is down" case: two SKUs in the
 * same category moving hard in opposite directions (substitution, a stock-out, a price change).
 */
export type Anomaly = {
  kind: "divergence" | "surge" | "drop";
  severity: Severity;
  summary: string;
  items: AnomalyItem[];
  /** ISO dates (inclusive) of the two periods compared. */
  period: { start: string; end: string };
  baseline: { start: string; end: string };
};

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
  /** What the anomaly scan flagged when the report was generated. Empty for older reports. */
  anomalies: Anomaly[];
};

/**
 * A saved report, opened from the Reports page. Now actually persisted (lib/report-store.ts)
 * for every /api/reports/[name] call — see the note on `Brief` below for how this relates to
 * it.
 */
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

// --- Dashboard page: KPIs, charts, signals (mocked today — see src/mocks) ---
//
// Distinct from the chat/report `ChartBlock` above: that one is a block inside a streamed
// reply (`ChartSpec`-driven, chart library agnostic). `DashboardChartBlock` below is a
// dashboard widget rendered from `Kpi`/`Signal`/`Metric` data, not from an agent reply.

export type Domain = "sales" | "inventory" | "accounting";
export type SignalStatus = "open" | "acknowledged" | "resolved";
export type Severity = "high" | "medium" | "low";
export type Detector = "zscore_7d" | "wow_change" | "threshold_breach";

// ── Metric layer ─────────────────────────────────────────────────────────

export type MetricUnit = "SGD" | "units" | "percent" | "ratio" | "days" | "count";
export type MetricDirection = "higher_is_better" | "lower_is_better" | "context_dependent";
export type Grain = "day" | "week" | "month";

export interface Metric {
  id: string;
  label: string;
  description: string;
  unit: MetricUnit;
  direction: MetricDirection;
  benchmark: string | null;
  grain: Grain[];
  dimensions: string[];
  detectors: Detector[];
  owner_domain: Domain;
}

export interface SeriesPoint {
  period: string; // ISO date (day grain) or "2026-W37" / "2026-09"
  value: number;
  expected?: number; // detector baseline, when known
}

export interface MetricSeries {
  metric_id: string;
  grain: Grain;
  dimensions: Record<string, string>;
  points: SeriesPoint[];
}

// ── Signals (detector output) ────────────────────────────────────────────

export interface Signal {
  signal_id: string;
  detected_at: string; // ISO timestamp
  metric_id: string;
  grain: string;
  dimensions: Record<string, string>;
  period: string;
  observed: number;
  expected: number;
  deviation: number; // fractional: -0.309 = 30.9% below expected
  score: number; // 0–1 anomaly score, used for ranking
  dollar_impact_est: number; // SGD, negative = loss
  detector: string;
  status: SignalStatus;
}

// ── Morning Brief (agent output) ─────────────────────────────────────────

export interface CausalStep {
  domain: Domain;
  claim: string;
  metric_id: string;
}

export interface BriefItem {
  rank: number;
  title: string;
  severity: Severity;
  domain: Domain; // where the problem surfaces
  summary: string; // one or two sentences, plain language
  dollar_impact_est: number;
  signal_ids: string[];
  causal_chain: CausalStep[]; // Correlator output; may be empty
  recommended_action: string | null;
}

export interface Kpi {
  metric_id: string;
  label: string;
  unit: MetricUnit;
  value: number;
  previous: number; // same metric, previous comparable period
  direction: MetricDirection;
  spark: number[]; // last N periods, oldest first
  sub?: string; // context line, e.g. "vs 14d target"
}

/**
 * Mock stand-in for the "morning-brief" `Report` (above): served from mocks/fixtures.ts via
 * lib/data.ts, not from a real report. `Report`'s `kind: "morning-brief"` rows are now
 * persisted for real (lib/report-store.ts) but only carry freeform `ContentBlock`s — the
 * agent's actual reply, not the structured severity/causal_chain/dollar_impact_est fields
 * below. Those need real detector output (data/simulator's schema.py reserves `briefings` for
 * it, unbuilt), so `/reports` stays on this mock until that exists; don't merge the two types
 * until it does, or this shape's structure silently disappears.
 */
export interface Brief {
  brief_id: string;
  generated_at: string;
  period: string; // the business day the brief covers
  headline: string;
  kpis: Kpi[];
  items: BriefItem[]; // ≤5, ranked
}

// ── Dashboard ────────────────────────────────────────────────────────────

export interface DashboardChartBlock {
  title: string;
  kind: "bars" | "list" | "line";
  unit: MetricUnit;
  seriesLabels?: [string, string];
  data: { label: string; value: number; compare?: number }[];
}

export interface DomainDashboard {
  kpis: Kpi[];
  charts: DashboardChartBlock[];
}

/** A metric the affinity model suggests, based on what the owner keeps asking about. */
export interface RecommendedMetric {
  metric_id: string;
  label: string;
  domain: Domain;
  unit: MetricUnit;
  value: number;
  previous: number;
  direction: MetricDirection;
  query_count: number; // times asked about in the last 6 weeks
  tags: string[];
  pinned: boolean;
  spark: number[];
  reason: string; // why this is being suggested
}

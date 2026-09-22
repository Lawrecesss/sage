// Frontend contracts. These mirror shapes owned by other lanes — change them together:
//   Signal       ← mcp/src/sage_mcp/demo_data.py (future `signals` table)
//   Metric       ← metrics.yaml (governed metric layer, served by MCP list_metrics)
//   CausalStep   ← data/simulator/src/sage_simulator/incidents/schema.py
//   Brief        ← brief-JSON contract with the agent lane (future `briefings` table)
// Snake_case field names match the wire/DB format on purpose; don't camelCase them.

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

export interface Brief {
  brief_id: string;
  generated_at: string;
  period: string; // the business day the brief covers
  headline: string;
  kpis: Kpi[];
  items: BriefItem[]; // ≤5, ranked
}

// ── Dashboard ────────────────────────────────────────────────────────────

export interface ChartBlock {
  title: string;
  kind: "bars" | "list" | "line";
  unit: MetricUnit;
  seriesLabels?: [string, string];
  data: { label: string; value: number; compare?: number }[];
}

export interface DomainDashboard {
  kpis: Kpi[];
  charts: ChartBlock[];
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

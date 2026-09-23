// Server-side data access for every page and /api route.
//
// One seam between the UI and the backend: pages call these functions, never
// fetch/SQL directly. SAGE_DATA_SOURCE=mock (default) serves fixtures; "live"
// is where the real reads go once the `signals` / `briefings` tables and the
// metric layer exist. Keep function signatures stable when implementing live.
// Server-only: import from server components and route handlers, not "use client" files.
//
// Going live is tenant-scoped work: business data lives in a per-tenant Postgres
// schema (ARCHITECTURE.md §3.2), reached through the shared pool in lib/db.ts with
// `SET search_path` per request. These functions will therefore take the resolved
// tenant (lib/tenant.ts) as their first argument — pages get it from `headers()`,
// route handlers from the Request. Mock mode ignores tenancy on purpose: it exists
// so the UI can be built before the warehouse is populated.

import { DASHBOARD, QUERY_FREQUENCY, RECOMMENDED } from "@/mocks/dashboard";
import { MOCK_BRIEF_HISTORY, MOCK_SIGNALS, mockSeries } from "@/mocks/fixtures";
import metricsCatalog from "@/mocks/metrics.json";
import type {
  Brief,
  Domain,
  DomainDashboard,
  Metric,
  MetricSeries,
  RecommendedMetric,
  Signal,
  SignalStatus,
} from "./types";

const SOURCE = process.env.SAGE_DATA_SOURCE ?? "mock";
const METRICS = metricsCatalog as Metric[];

function live(): never {
  // TODO(live): query the caller's tenant schema (signals, briefings) via getPool(),
  // or call the retail-mcp tools; thread tenantId through from resolveTenant().
  throw new Error("SAGE_DATA_SOURCE=live is not implemented yet");
}

// ── Briefs ───────────────────────────────────────────────────────────────

export async function getLatestBrief(): Promise<Brief | null> {
  if (SOURCE === "live") live();
  return MOCK_BRIEF_HISTORY[0] ?? null;
}

/** Newest first — the History page's list. */
export async function listBriefs(): Promise<Brief[]> {
  if (SOURCE === "live") live();
  return MOCK_BRIEF_HISTORY;
}

export async function getBrief(briefId: string): Promise<Brief | null> {
  if (SOURCE === "live") live();
  return MOCK_BRIEF_HISTORY.find((b) => b.brief_id === briefId) ?? null;
}

// ── Signals ──────────────────────────────────────────────────────────────

export interface SignalFilter {
  status?: SignalStatus;
  domain?: Domain;
  limit?: number;
}

export async function listSignals(filter: SignalFilter = {}): Promise<Signal[]> {
  if (SOURCE === "live") live();
  return MOCK_SIGNALS.filter(
    (s) =>
      (!filter.status || s.status === filter.status) &&
      (!filter.domain || metricDomain(s.metric_id) === filter.domain),
  )
    .sort((a, b) => b.score - a.score)
    .slice(0, filter.limit ?? 100);
}

export async function getSignal(signalId: string): Promise<Signal | null> {
  if (SOURCE === "live") live();
  return MOCK_SIGNALS.find((s) => s.signal_id === signalId) ?? null;
}

// ── Metrics ──────────────────────────────────────────────────────────────

export async function listMetrics(): Promise<Metric[]> {
  return METRICS;
}

export async function getMetric(metricId: string): Promise<Metric | null> {
  return METRICS.find((m) => m.id === metricId) ?? null;
}

export async function getMetricSeries(
  metricId: string,
  dimensions: Record<string, string> = {},
): Promise<MetricSeries> {
  if (SOURCE === "live") live();
  return mockSeries(metricId, dimensions, METRICS.find((m) => m.id === metricId)?.unit);
}

/** Domain that owns a metric, per the metric catalog. */
export function metricDomain(metricId: string): Domain | undefined {
  return METRICS.find((m) => m.id === metricId)?.owner_domain;
}

// ── Dashboard ────────────────────────────────────────────────────────────

export async function getDomainDashboard(domain: Domain): Promise<DomainDashboard> {
  if (SOURCE === "live") live();
  return DASHBOARD[domain];
}

/** Metrics the affinity model suggests, most-queried first. */
export async function getRecommended(): Promise<{
  metrics: RecommendedMetric[];
  frequency: typeof QUERY_FREQUENCY;
  updated_at: string;
}> {
  if (SOURCE === "live") live();
  return {
    metrics: [...RECOMMENDED].sort((a, b) => b.query_count - a.query_count),
    frequency: QUERY_FREQUENCY,
    updated_at: "2026-09-19T05:00:00+08:00",
  };
}

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
import { liveDomainDashboard, liveMetricSeries, liveSignal, liveSignals } from "./live";
import { getReport as getStoredReport, listReports as listStoredReports } from "./report-store";
import type {
  Brief,
  Domain,
  DomainDashboard,
  Metric,
  MetricSeries,
  Report,
  ReportSummary,
  RecommendedMetric,
  Signal,
  SignalStatus,
} from "./types";

const SOURCE = process.env.SAGE_DATA_SOURCE ?? "mock";
const METRICS = metricsCatalog as Metric[];

// ── Brief (legacy /api/brief only) ──────────────────────────────────────
// Always mock, even in live mode: a real Brief needs causal_chain/severity output
// from a Correlator that doesn't exist yet (see lib/live.ts's header comment).
// /history no longer uses this — see Reports below — but /api/brief still does,
// so it degrades to illustrative data instead of throwing and breaking that route.

export async function getLatestBrief(): Promise<Brief | null> {
  return MOCK_BRIEF_HISTORY[0] ?? null;
}

// ── Reports ──────────────────────────────────────────────────────────────
// Real, always: these read the `reports` table saved by every POST /api/reports/[name]
// call (lib/report-store.ts) — no mock, no SAGE_DATA_SOURCE toggle. The History page's
// list and detail view.

/** Newest first — the History page's list. */
export async function listReports(tenantId: string, limit?: number): Promise<ReportSummary[]> {
  return listStoredReports(tenantId, limit);
}

export async function getReport(tenantId: string, reportId: string): Promise<Report | null> {
  return getStoredReport(tenantId, reportId);
}

// ── Signals ──────────────────────────────────────────────────────────────

export interface SignalFilter {
  status?: SignalStatus;
  domain?: Domain;
  limit?: number;
}

export async function listSignals(tenantId: string, filter: SignalFilter = {}): Promise<Signal[]> {
  if (SOURCE === "live") return liveSignals(tenantId, filter);
  return MOCK_SIGNALS.filter(
    (s) =>
      (!filter.status || s.status === filter.status) &&
      (!filter.domain || metricDomain(s.metric_id) === filter.domain),
  )
    .sort((a, b) => b.score - a.score)
    .slice(0, filter.limit ?? 100);
}

export async function getSignal(tenantId: string, signalId: string): Promise<Signal | null> {
  if (SOURCE === "live") return liveSignal(tenantId, signalId);
  return MOCK_SIGNALS.find((s) => s.signal_id === signalId) ?? null;
}

// ── Metrics ──────────────────────────────────────────────────────────────
// The catalog itself (id/label/unit/description/...) is governed metadata, not
// per-tenant data — it's served from metrics.json in both mock and live mode.

export async function listMetrics(): Promise<Metric[]> {
  return METRICS;
}

export async function getMetric(metricId: string): Promise<Metric | null> {
  return METRICS.find((m) => m.id === metricId) ?? null;
}

export async function getMetricSeries(
  tenantId: string,
  metricId: string,
  dimensions: Record<string, string> = {},
): Promise<MetricSeries> {
  if (SOURCE === "live") return liveMetricSeries(tenantId, metricId, dimensions);
  return mockSeries(metricId, dimensions, METRICS.find((m) => m.id === metricId)?.unit);
}

/** Domain that owns a metric, per the metric catalog. */
export function metricDomain(metricId: string): Domain | undefined {
  return METRICS.find((m) => m.id === metricId)?.owner_domain;
}

// ── Dashboard ────────────────────────────────────────────────────────────

export async function getDomainDashboard(tenantId: string, domain: Domain): Promise<DomainDashboard> {
  if (SOURCE === "live") return liveDomainDashboard(tenantId, domain);
  return DASHBOARD[domain];
}

/**
 * Metrics the affinity model suggests, most-queried first. Always mock, even in live
 * mode: it needs a query-frequency affinity model that doesn't exist yet, and this is
 * called unconditionally by the dashboard page, so it degrades to illustrative data
 * instead of breaking the page the way `live()` throwing would.
 */
export async function getRecommended(): Promise<{
  metrics: RecommendedMetric[];
  frequency: typeof QUERY_FREQUENCY;
  updated_at: string;
}> {
  return {
    metrics: [...RECOMMENDED].sort((a, b) => b.query_count - a.query_count),
    frequency: QUERY_FREQUENCY,
    updated_at: "2026-09-19T05:00:00+08:00",
  };
}

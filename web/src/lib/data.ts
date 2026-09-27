// Server-side data access for every page and /api route.
//
// One seam between the UI and the backend: pages call these functions, never
// fetch/SQL directly. SAGE_DATA_SOURCE=mock (default) serves fixtures; "live"
// reads the tenant's Postgres schema. Keep function signatures stable when implementing live.
// Server-only: import from server components and route handlers, not "use client" files.
//
// Going live is tenant-scoped work: business data lives in a per-tenant Postgres
// schema (ARCHITECTURE.md §3.2), reached through the shared pool in lib/db.ts with
// `SET search_path` per request. These functions will therefore take the resolved
// tenant (lib/tenant.ts) as their first argument — pages get it from `headers()`,
// route handlers from the Request. Mock mode ignores tenancy on purpose: it exists
// so the UI can be built before the warehouse is populated.

import { DASHBOARD, QUERY_FREQUENCY, RECOMMENDED } from "@/mocks/dashboard";
import { mockEnquiryOverview } from "@/mocks/enquiries";
import { mockAnomalies } from "@/mocks/anomalies";
import { MOCK_BRIEF_HISTORY, mockSeries } from "@/mocks/fixtures";
import metricsCatalog from "@/mocks/metrics.json";
import { scanEnquiriesSafe } from "./enquiries";
import { detectAnomaliesSafe } from "./anomalies";
import { liveDomainDashboard, liveMetricSeries } from "./live";
import { computeWindow } from "./report-windows";
import {
  deleteReport as deleteStoredReport,
  getReport as getStoredReport,
  listReports as listStoredReports,
} from "./report-store";
import type {
  Anomaly,
  Brief,
  Domain,
  DomainDashboard,
  EnquiryOverview,
  Metric,
  MetricSeries,
  Report,
  ReportSummary,
  RecommendedMetric,
} from "./types";

const SOURCE = process.env.SAGE_DATA_SOURCE ?? "mock";
const METRICS = metricsCatalog as Metric[];

// ── Brief (legacy /api/brief only) ──────────────────────────────────────
// Always mock, even in live mode: a real Brief needs causal_chain/severity output
// from a Correlator that doesn't exist yet (see lib/live.ts's header comment).
// /reports no longer uses this — see Reports below — but /api/brief still does,
// so it degrades to illustrative data instead of throwing and breaking that route.

export async function getLatestBrief(): Promise<Brief | null> {
  return MOCK_BRIEF_HISTORY[0] ?? null;
}

// ── Reports ──────────────────────────────────────────────────────────────
// Real, always: these read the `reports` table saved by every POST /api/reports/[name]
// call (lib/report-store.ts) — no mock, no SAGE_DATA_SOURCE toggle. The Reports page's
// list and detail view.

/** Newest first — the Reports page's list. */
export async function listReports(tenantId: string, limit?: number): Promise<ReportSummary[]> {
  return listStoredReports(tenantId, limit);
}

export async function getReport(tenantId: string, reportId: string): Promise<Report | null> {
  return getStoredReport(tenantId, reportId);
}

/** False if there was no such report. */
export async function deleteReport(tenantId: string, reportId: string): Promise<boolean> {
  return deleteStoredReport(tenantId, reportId);
}

// ── Anomalies ────────────────────────────────────────────────────────────
// The same deterministic scan every report runs first (lib/anomalies.ts), here over the last
// 7 complete local days vs the 7 before — for the dashboard's Anomalies card and /anomalies.
// Anomalies flagged by past report runs are read from the saved reports (lib/notifications.ts).

const ANOMALY_SCAN_DAYS = 7;

export async function listCurrentAnomalies(tenantId: string): Promise<Anomaly[]> {
  const now = new Date();
  if (SOURCE !== "live") return mockAnomalies(now);
  // Today's local midnight: the scan works on whole days, so today's partial sales are left out.
  const through = computeWindow({ kind: "day", startHour: 0, endHour: 24 }, now).start;
  const start = new Date(through.getTime() - ANOMALY_SCAN_DAYS * 86_400_000);
  return detectAnomaliesSafe(tenantId, {
    start,
    end: through,
    through,
    partial: false,
    baselineStart: new Date(start.getTime() - ANOMALY_SCAN_DAYS * 86_400_000),
    baselineThrough: start,
  });
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

// ── Dashboard ────────────────────────────────────────────────────────────

export async function getDomainDashboard(tenantId: string, domain: Domain): Promise<DomainDashboard> {
  if (SOURCE === "live") return liveDomainDashboard(tenantId, domain);
  return DASHBOARD[domain];
}

/** How far back the dashboard's enquiry handling figures (SLA hit rate, first response) look. */
const ENQUIRY_FLOW_DAYS = 7;

/**
 * The dashboard's customer-enquiry section: open backlog right now, most urgent first, plus
 * handling over the last week. Null in live mode if the tenant has no enquiry table (seeded
 * before enquiries existed) — the section says so rather than breaking the page.
 */
export async function getEnquiryOverview(tenantId: string): Promise<EnquiryOverview | null> {
  const now = new Date();
  if (SOURCE !== "live") return mockEnquiryOverview(now);
  return scanEnquiriesSafe(tenantId, now, new Date(now.getTime() - ENQUIRY_FLOW_DAYS * 86_400_000));
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

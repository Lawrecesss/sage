// The anomaly scan run before every report: SKU-level gross revenue, this period against the
// one before, flagging the SKUs that moved hard — and, above all, the "A is grossing up while B
// is grossing down" pairs inside one category, which usually mean substitution (one went out of
// stock, or was repriced) rather than a change in demand. The result goes two places: into the
// report prompt, as facts for the agent to confirm with its tools and explain, and into the
// saved report, so the Reports page and the PDF can show it without re-reading the prose.
//
// Deterministic SQL on purpose. The agent is good at explaining a movement and bad at noticing
// one in a 100-row tool result, so the noticing is done here and the explaining is left to it.
//
// Sales data is by calendar date only (no time of day), and one day per SKU is noise, so the
// current period is the report window's local dates, widened to at least 7 days; the baseline
// is the same number of days immediately before it.

import { getPool } from "@/lib/db";
import { type ReportWindow, localDate } from "@/lib/report-windows";
import type { Anomaly, AnomalyItem, Severity } from "@/lib/types";

const VALID_SCHEMA = /^[a-z][a-z0-9_]{0,62}$/;
const MIN_DAYS = 7;
/** A move smaller than this fraction of the SKU's own baseline isn't flagged. */
const MIN_CHANGE = 0.3;
const MAX_ANOMALIES = 8;

const DAY_MS = 86_400_000;
const shift = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** The two inclusive date ranges the scan compares, for a report window. */
export function scanPeriods(w: ReportWindow): { period: Anomaly["period"]; baseline: Anomaly["baseline"] } {
  const end = localDate(new Date(w.through.getTime() - 1));
  const start = [localDate(w.start), shift(end, 1 - MIN_DAYS)].sort()[0];
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
  return { period: { start, end }, baseline: { start: shift(start, -days), end: shift(start, -1) } };
}

type Row = { sku: string; name: string; category: string; current: string | number; previous: string | number };
type Move = AnomalyItem & { delta: number };

const pct = (c: number | null) => (c === null ? "from no baseline sales" : `${Math.abs(Math.round(c * 100))}%`);

export async function detectAnomalies(tenantId: string, w: ReportWindow): Promise<Anomaly[]> {
  if (!VALID_SCHEMA.test(tenantId)) throw new Error(`invalid tenant schema name: ${tenantId}`);
  const { period, baseline } = scanPeriods(w);
  const { rows } = await getPool().query<Row>(
    `SELECT s.sku, s.name, s.category,
            COALESCE(SUM(f.line_total_sgd) FILTER (WHERE f.date >= $3), 0) AS current,
            COALESCE(SUM(f.line_total_sgd) FILTER (WHERE f.date <= $2), 0) AS previous
       FROM "${tenantId}".fact_order_line f
       JOIN "${tenantId}".dim_sku s ON s.sku = f.sku
      WHERE NOT f.is_refund AND f.date BETWEEN $1 AND $4
      GROUP BY s.sku, s.name, s.category`,
    [baseline.start, baseline.end, period.start, period.end],
  );

  const moves: Move[] = rows.map((r) => {
    const current = Number(r.current);
    const previous = Number(r.previous);
    return {
      sku: r.sku,
      name: r.name,
      category: r.category,
      current,
      previous,
      change: previous > 0 ? (current - previous) / previous : null,
      delta: current - previous,
    };
  });
  const total = moves.reduce((sum, m) => sum + m.previous, 0);
  if (total === 0) return []; // no baseline to compare against — nothing is "anomalous" yet

  // Ignore moves too small to matter in dollars, however large in percent.
  const minDollars = Math.max(100, total * 0.005);
  const isUp = (m: Move) => m.delta >= minDollars && (m.change === null || m.change >= MIN_CHANGE);
  const isDown = (m: Move) => -m.delta >= minDollars && m.change !== null && m.change <= -MIN_CHANGE;
  const severity = (dollars: number): Severity =>
    dollars >= total * 0.03 ? "high" : dollars >= total * 0.01 ? "medium" : "low";
  const item = ({ delta: _, ...rest }: Move): AnomalyItem => rest;

  const found: (Anomaly & { weight: number })[] = [];
  const used = new Set<string>();

  // Divergences: the biggest riser and faller in each category, if both moved hard.
  const categories = [...new Set(moves.map((m) => m.category))];
  for (const category of categories) {
    const inCategory = moves.filter((m) => m.category === category);
    const up = inCategory.filter(isUp).sort((a, b) => b.delta - a.delta)[0];
    const down = inCategory.filter(isDown).sort((a, b) => a.delta - b.delta)[0];
    if (!up || !down) continue;
    const weight = Math.max(up.delta, -down.delta);
    found.push({
      kind: "divergence",
      severity: severity(weight),
      summary: `${up.name} is grossing up ${pct(up.change)} while ${down.name} is down ${pct(down.change)} in ${category}`,
      items: [item(up), item(down)],
      period,
      baseline,
      weight,
    });
    used.add(up.sku).add(down.sku);
  }

  // Everything else that moved hard on its own.
  for (const m of moves) {
    if (used.has(m.sku)) continue;
    const up = isUp(m);
    if (!up && !isDown(m)) continue;
    found.push({
      kind: up ? "surge" : "drop",
      severity: severity(Math.abs(m.delta)),
      summary: up
        ? `${m.name} is grossing up ${pct(m.change)}`
        : `${m.name} is grossing down ${pct(m.change)}`,
      items: [item(m)],
      period,
      baseline,
      weight: Math.abs(m.delta),
    });
  }

  return found
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_ANOMALIES)
    .map(({ weight: _, ...anomaly }) => anomaly);
}

/** detectAnomalies, but a failed scan never blocks the report — it just goes without. */
export async function detectAnomaliesSafe(tenantId: string, w: ReportWindow): Promise<Anomaly[]> {
  try {
    return await detectAnomalies(tenantId, w);
  } catch (err) {
    console.error(`[anomalies] scan failed for ${tenantId}`, err);
    return [];
  }
}

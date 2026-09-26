// The anomaly scan run before every report: SKU-level gross revenue, this period against the
// one before, flagging the SKUs that moved hard — and, above all, the "A is grossing up while B
// is grossing down" pairs inside one category, which usually mean substitution (one went out of
// stock, or was repriced) rather than a change in demand. Each finding carries a recommended
// action worked out from the SKU's current stock and its supplier's lead time. The result goes
// two places: into the report prompt, as facts for the agent to confirm with its tools and
// explain, and into the saved report, so the Reports page and the PDF can show it without
// re-reading the prose.
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

type Row = {
  sku: string;
  name: string;
  category: string;
  lead_time_days: number;
  current: string | number;
  previous: string | number;
  current_units: string | number;
};
type Move = { sku: string; name: string; category: string; current: number; previous: number; change: number | null; delta: number; units: number; leadTimeDays: number };

const pct = (c: number | null) => (c === null ? "from no baseline sales" : `${Math.abs(Math.round(c * 100))}%`);

export async function detectAnomalies(tenantId: string, w: ReportWindow): Promise<Anomaly[]> {
  if (!VALID_SCHEMA.test(tenantId)) throw new Error(`invalid tenant schema name: ${tenantId}`);
  const { period, baseline } = scanPeriods(w);
  const { rows } = await getPool().query<Row>(
    `SELECT s.sku, s.name, s.category, sup.lead_time_days,
            COALESCE(SUM(f.line_total_sgd) FILTER (WHERE f.date >= $3), 0) AS current,
            COALESCE(SUM(f.line_total_sgd) FILTER (WHERE f.date <= $2), 0) AS previous,
            COALESCE(SUM(f.qty) FILTER (WHERE f.date >= $3), 0) AS current_units
       FROM "${tenantId}".fact_order_line f
       JOIN "${tenantId}".dim_sku s ON s.sku = f.sku
       JOIN "${tenantId}".dim_supplier sup ON sup.supplier_id = s.supplier_id
      WHERE NOT f.is_refund AND f.date BETWEEN $1 AND $4
      GROUP BY s.sku, s.name, s.category, sup.lead_time_days`,
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
      units: Number(r.current_units),
      leadTimeDays: Number(r.lead_time_days),
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

  type Found = Omit<Anomaly, "items" | "action"> & { moves: Move[]; weight: number };
  const found: Found[] = [];
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
      moves: [up, down],
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
      summary: up ? `${m.name} is grossing up ${pct(m.change)}` : `${m.name} is grossing down ${pct(m.change)}`,
      moves: [m],
      period,
      baseline,
      weight: Math.abs(m.delta),
    });
  }

  const top = found.sort((a, b) => b.weight - a.weight).slice(0, MAX_ANOMALIES);
  const days = Math.round((Date.parse(period.end) - Date.parse(period.start)) / DAY_MS) + 1;
  const stock = await onHand(tenantId, top.flatMap((a) => a.moves.map((m) => m.sku)));

  return top.map(({ weight: _, moves: flagged, ...anomaly }) => {
    const items = flagged.map(({ delta: _d, units, ...m }): AnomalyItem => {
      const qty = stock.get(m.sku) ?? null;
      const perDay = units / days;
      return { ...m, onHand: qty, daysOfCover: qty === null || perDay <= 0 ? null : Math.max(0, qty) / perDay };
    });
    return { ...anomaly, items, action: recommend(anomaly.kind, items) };
  });
}

/** Latest on-hand quantity per SKU — the same "current stock" read retail-mcp and the dashboard use. */
async function onHand(tenantId: string, skus: string[]): Promise<Map<string, number>> {
  if (skus.length === 0) return new Map();
  const { rows } = await getPool().query<{ sku: string; on_hand_after: number }>(
    `SELECT DISTINCT ON (sku) sku, on_hand_after
       FROM "${tenantId}".fact_stock_movement
      WHERE sku = ANY($1)
      ORDER BY sku, date DESC, movement_id DESC`,
    [skus],
  );
  return new Map(rows.map((r) => [r.sku, Number(r.on_hand_after)]));
}

// ── Recommended actions ────────────────────────────────────────────────────
// Rules, not the agent: the same stock facts always give the same advice, and the advice is
// there even when the agent run fails. The prompt asks the agent to refine them in its prose.

const isOut = (i: AnomalyItem) => i.onHand != null && i.onHand <= 0;
/** Stock runs out before a reorder placed today would arrive. */
const isShort = (i: AnomalyItem) => i.daysOfCover != null && i.leadTimeDays != null && i.daysOfCover < i.leadTimeDays;
const cover = (i: AnomalyItem) =>
  `about ${Math.round(i.daysOfCover ?? 0)} days of stock at the current pace vs a ${i.leadTimeDays}-day supplier lead time`;
const inStock = (i: AnomalyItem) => (i.onHand == null ? "stock" : `${i.onHand} in stock`);

export function recommend(kind: Anomaly["kind"], items: AnomalyItem[]): string {
  if (kind === "divergence") {
    const [up, down] = items;
    const main = isOut(down)
      ? `Restock ${down.name} (${down.sku}) now: it's out of stock (${down.onHand} on hand), so customers are likely switching to ${up.name}.`
      : `Check whether ${down.name} (${down.sku}) was repriced, delisted or moved: it still has ${inStock(down)} but customers are buying ${up.name} instead. If the switch lasts, shift reorders toward ${up.name}.`;
    const extra = isOut(up)
      ? ` ${up.name} is out of stock too, so reorder it as well.`
      : isShort(up)
        ? ` ${up.name} has only ${cover(up)}, so reorder it now.`
        : "";
    return main + extra;
  }

  const [i] = items;
  if (kind === "drop") {
    return isOut(i)
      ? `Reorder ${i.name} (${i.sku}) now: it's out of stock (${i.onHand} on hand), which explains the drop. Chase any open purchase order.`
      : `${i.name} (${i.sku}) still has ${inStock(i)} but has stopped selling: check its price against competitors, its listing and its placement.`;
  }
  if (isOut(i)) return `Reorder ${i.name} (${i.sku}) now: demand is up but it's out of stock (${i.onHand} on hand), so sales are being lost.`;
  if (isShort(i)) return `Reorder ${i.name} (${i.sku}) now: it has ${cover(i)}, so it will run out before new stock arrives.`;
  const days = i.daysOfCover == null ? "" : ` Stock covers about ${Math.round(i.daysOfCover)} days.`;
  return `Find out what's driving ${i.name} (${i.sku}), such as a promotion, a listing change or a trend, and keep it going.${days}`;
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

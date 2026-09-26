// Live (Postgres-backed) implementations for the dashboard/metrics/signals
// surface that `lib/data.ts` used to serve entirely from `src/mocks/`.
//
// Scope, deliberately: dashboard KPIs/charts and metric series are wired to
// real SQL against the tenant's schema; signals implement the
// "threshold_breach" detector only (the same checks retail-mcp's
// get_attention_items runs), reusing that exact logic so the chat agent and
// the dashboard never disagree about what counts as an issue. The
// "zscore_7d"/"wow_change" detectors are real statistical work, not a
// data-source swap, and are NOT implemented here — see the `detector: "threshold_breach"`
// note on every signal below. Briefs (causal_chain, severity ranking across
// signals) and the Recommended panel (affinity model) stay on mock data for
// the same reason `lib/data.ts` always has: they need detector/correlator
// output this project hasn't built.
//
// All current-vs-previous comparisons here use trailing-N-day windows anchored
// to CURRENT_DATE (real wall-clock "today"), not MAX(date) in the fact table.
// This relies on the seeded dataset having headroom past the real clock (see
// GeneratorConfig.months's docstring in sage_simulator/config.py) — the same
// assumption retail-mcp's CURRENT_DATE-defaulting tools make. The one
// deliberate exception is inventory's avg_daily_demand below, which mirrors
// simulate_reorder_impact's own anchor-to-latest-sales-date choice (see its
// docstring in MCP_TOOLS.md) rather than this file's usual CURRENT_DATE rule.

import type { Pool, PoolClient } from "pg";
import { getPool } from "@/lib/db";
import type {
  DashboardChartBlock,
  Domain,
  DomainDashboard,
  Kpi,
  Metric,
  MetricSeries,
  MetricUnit,
  Signal,
  SignalStatus,
} from "@/lib/types";
import { mockSeries } from "@/mocks/fixtures";
import metricsCatalog from "@/mocks/metrics.json";

const METRICS = metricsCatalog as Metric[];

// ── plumbing ─────────────────────────────────────────────────────────────

/** tenantId here always arrives already-validated (resolveTenant/resolveTenantForPage
 * ran first and confirmed it against shared.tenants) — same trust model retail-mcp's
 * assert_tenant_active + SET search_path uses. */
async function withTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool: Pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${tenantId}"`);
    return await fn(client);
  } finally {
    client.release();
  }
}

function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}

function pctChange(cur: number, prev: number): number {
  return prev === 0 ? (cur === 0 ? 0 : 1) : (cur - prev) / prev;
}

function kpi(
  metric_id: string,
  label: string,
  unit: MetricUnit,
  value: number,
  previous: number,
  direction: Kpi["direction"],
  sub: string,
): Kpi {
  // Real historical spark data would mean N extra queries per KPI; left empty
  // (Sparkline renders nothing for <2 points) rather than fabricating a trend.
  return { metric_id, label, unit, value, previous, direction, sub, spark: [] };
}

// ── sales domain ─────────────────────────────────────────────────────────

async function salesDashboard(client: PoolClient): Promise<DomainDashboard> {
  const { rows } = await client.query(`
    WITH bounds AS (SELECT CURRENT_DATE AS latest),
    windowed AS (
      SELECT
        f.*, (f.date > b.latest - INTERVAL '30 days') AS is_current
      FROM fact_order_line f, bounds b
      WHERE f.date > b.latest - INTERVAL '60 days' AND f.date <= b.latest
    )
    SELECT
      is_current,
      COALESCE(SUM(line_total_sgd), 0) AS gross_revenue,
      COALESCE(SUM(CASE WHEN NOT is_refund THEN line_total_sgd ELSE 0 END), 0) AS net_revenue,
      COALESCE(SUM(CASE WHEN is_refund THEN line_total_sgd ELSE 0 END), 0) AS refunds,
      COALESCE(SUM(CASE WHEN NOT is_refund THEN qty ELSE 0 END), 0) AS units_sold,
      COUNT(DISTINCT order_id) FILTER (WHERE NOT is_refund)::int AS order_count
    FROM windowed
    GROUP BY is_current
  `);
  const cur = rows.find((r) => r.is_current) ?? {};
  const prev = rows.find((r) => !r.is_current) ?? {};

  const curNet = num(cur.net_revenue);
  const prevNet = num(prev.net_revenue);
  const curOrders = num(cur.order_count);
  const prevOrders = num(prev.order_count);
  const curAov = curOrders ? curNet / curOrders : 0;
  const prevAov = prevOrders ? prevNet / prevOrders : 0;
  const curReturnRate = num(cur.gross_revenue) ? num(cur.refunds) / num(cur.gross_revenue) : 0;
  const prevReturnRate = num(prev.gross_revenue) ? num(prev.refunds) / num(prev.gross_revenue) : 0;

  const kpis: Kpi[] = [
    kpi("gross_revenue", "Gross Revenue", "SGD", num(cur.gross_revenue), num(prev.gross_revenue), "higher_is_better", "Last 30 days"),
    kpi("net_revenue", "Net Revenue", "SGD", curNet, prevNet, "higher_is_better", "After returns"),
    kpi("average_order_value", "Average Order Value", "SGD", curAov, prevAov, "context_dependent", "vs SGD 150-400 typical"),
    kpi("units_sold", "Units Sold", "units", num(cur.units_sold), num(prev.units_sold), "higher_is_better", "Last 30 days"),
    kpi("return_rate", "Return Rate", "percent", curReturnRate, prevReturnRate, "lower_is_better", "vs 3-8% typical"),
    // Not derivable: this schema has no delivery/assembly-service field on fact_order_line
    // (see sage_simulator/db/schema.py) — nothing to compute a real attach rate from.
    // Left as an illustrative placeholder rather than reporting a fabricated 0%/100%.
    kpi("delivery_attach_rate", "Delivery Attach Rate", "percent", 0.38, 0.41, "higher_is_better", "Illustrative — not tracked in this dataset"),
  ];

  const [dailyRevenue, channelMix, categoryRevenue] = await Promise.all([
    client.query(`
      WITH bounds AS (SELECT CURRENT_DATE AS latest)
      SELECT
        to_char(date, 'Dy') AS label,
        date,
        COALESCE(SUM(line_total_sgd), 0) AS gross,
        COALESCE(SUM(CASE WHEN NOT is_refund THEN line_total_sgd ELSE 0 END), 0) AS net
      FROM fact_order_line, bounds
      WHERE date > bounds.latest - INTERVAL '7 days' AND date <= bounds.latest
      GROUP BY date
      ORDER BY date
    `),
    client.query(`
      WITH bounds AS (SELECT CURRENT_DATE AS latest)
      SELECT channel, COALESCE(SUM(CASE WHEN NOT is_refund THEN line_total_sgd ELSE 0 END), 0) AS net
      FROM fact_order_line, bounds
      WHERE date > bounds.latest - INTERVAL '30 days' AND date <= bounds.latest
      GROUP BY channel
      ORDER BY net DESC
    `),
    client.query(`
      WITH bounds AS (SELECT CURRENT_DATE AS latest)
      SELECT s.category, COALESCE(SUM(CASE WHEN NOT f.is_refund THEN f.line_total_sgd ELSE 0 END), 0) AS net
      FROM fact_order_line f
      JOIN dim_sku s ON s.sku = f.sku, bounds
      WHERE f.date > bounds.latest - INTERVAL '30 days' AND f.date <= bounds.latest
      GROUP BY s.category
      ORDER BY net DESC
      LIMIT 8
    `),
  ]);

  const totalChannelNet = channelMix.rows.reduce((s, r) => s + num(r.net), 0);

  const charts: DashboardChartBlock[] = [
    {
      title: "Daily revenue · gross vs net (last 7 days)",
      kind: "bars",
      unit: "SGD",
      seriesLabels: ["Gross", "Net"],
      data: dailyRevenue.rows.map((r) => ({ label: r.label, value: num(r.gross), compare: num(r.net) })),
    },
    {
      title: "Channel mix · share of net revenue (last 30 days)",
      kind: "list",
      unit: "percent",
      data: channelMix.rows.map((r) => ({
        label: r.channel,
        value: totalChannelNet ? num(r.net) / totalChannelNet : 0,
      })),
    },
    {
      title: "Revenue by category (last 30 days)",
      kind: "list",
      unit: "SGD",
      data: categoryRevenue.rows.map((r) => ({ label: r.category, value: num(r.net) })),
    },
  ];

  return { kpis, charts };
}

// ── inventory domain ─────────────────────────────────────────────────────

async function inventoryDashboard(client: PoolClient): Promise<DomainDashboard> {
  // "Current" = latest on_hand_after per SKU as of the most recent movement on or
  // before CURRENT_DATE — the `m.date <= CURRENT_DATE` filter matters because the
  // seeded dataset has movements dated past today on purpose (headroom, see
  // GeneratorConfig.months); without it this picks up a future snapshot instead of
  // today's. "Previous" (7 days earlier) is deliberately NOT a second DISTINCT ON
  // reconstruction of that day's snapshot — Postgres can't use an index to avoid a
  // full sort once a date filter sits on top of DISTINCT ON's ordering (measured:
  // ~185ms full-table sort even with an index that makes the unfiltered version
  // ~40ms). Instead it's derived algebraically: prior_on_hand = current_on_hand -
  // (net qty movement in the last 7 days) — mathematically identical, and just a
  // cheap filtered GROUP BY.
  const stockRows = await client.query(`
    SELECT DISTINCT ON (m.sku) m.sku, m.on_hand_after, s.category, s.name, s.unit_cost_sgd, s.supplier_id
    FROM fact_stock_movement m
    JOIN dim_sku s ON s.sku = m.sku
    WHERE m.date <= CURRENT_DATE
    ORDER BY m.sku, m.date DESC, m.movement_id DESC
  `);

  const recentChange = await client.query(`
    WITH bounds AS (SELECT CURRENT_DATE AS latest)
    SELECT sku, COALESCE(SUM(qty), 0)::float8 AS net_change
    FROM fact_stock_movement, bounds
    WHERE date > bounds.latest - INTERVAL '7 days' AND date <= bounds.latest
    GROUP BY sku
  `);
  const recentChangeBySku = new Map<string, number>(recentChange.rows.map((r) => [r.sku, num(r.net_change)]));
  const priorOnHand = (sku: string, currentOnHand: number) => currentOnHand - (recentChangeBySku.get(sku) ?? 0);

  let curOnHandTotal = 0;
  let prevOnHandTotal = 0;
  let curOut = 0;
  let prevOut = 0;
  for (const r of stockRows.rows) {
    const cur = num(r.on_hand_after);
    const prev = priorOnHand(r.sku, cur);
    curOnHandTotal += cur;
    prevOnHandTotal += prev;
    if (cur <= 0) curOut++;
    if (prev <= 0) prevOut++;
  }
  const skuCount = stockRows.rows.length || 1;
  const curStockoutRate = curOut / skuCount;
  const prevStockoutRate = prevOut / skuCount;

  // Demand: trailing-60-day average units/day per SKU, anchored at latest sales date
  // (same anchoring simulate_reorder_impact uses, for the same reason).
  const demand = await client.query(`
    WITH bounds AS (SELECT MAX(date) AS latest FROM fact_order_line)
    SELECT sku, COALESCE(SUM(qty), 0)::float8 / 60 AS avg_daily_demand
    FROM fact_order_line, bounds
    WHERE NOT is_refund AND date > bounds.latest - INTERVAL '60 days' AND date <= bounds.latest
    GROUP BY sku
  `);
  const demandBySku = new Map<string, number>(demand.rows.map((r) => [r.sku, num(r.avg_daily_demand)]));

  const supplierLeadTime = await client.query(`
    SELECT supplier_id, AVG(received_date - ordered_date)::float8 AS avg_lead_time
    FROM fact_purchase_order
    GROUP BY supplier_id
  `);
  const leadTimeBySupplier = new Map<string, number>(
    supplierLeadTime.rows.map((r) => [r.supplier_id, num(r.avg_lead_time)]),
  );

  // Proxy reorder point (no reorder_point config exists in this schema): flag a SKU
  // when current stock is already below (avg daily demand * its supplier's avg lead
  // time) — i.e. it would already run out before a fresh order could land. Documented
  // simplification; a real reorder-point policy would add a safety-stock buffer.
  let curBreaches = 0;
  let deadStockValue = 0;
  let deadStockPrevValue = 0;
  const deadStockByCategory = new Map<string, number>();
  const daysOfSupplyRows: { label: string; value: number }[] = [];

  let prevBreaches = 0;
  for (const r of stockRows.rows) {
    const demandRate = demandBySku.get(r.sku) ?? 0;
    const onHand = num(r.on_hand_after);
    const leadTime = leadTimeBySupplier.get(r.supplier_id);
    const prevOnHand = priorOnHand(r.sku, onHand);
    if (demandRate > 0 && leadTime != null) {
      if (onHand < demandRate * leadTime) curBreaches++;
      if (prevOnHand < demandRate * leadTime) prevBreaches++;
    }
    if (demandRate === 0) {
      const value = Math.max(onHand, 0) * num(r.unit_cost_sgd);
      deadStockValue += value;
      deadStockByCategory.set(r.category, (deadStockByCategory.get(r.category) ?? 0) + value);
      deadStockPrevValue += Math.max(prevOnHand, 0) * num(r.unit_cost_sgd);
    }
    if (demandRate > 0) {
      daysOfSupplyRows.push({ label: `${r.sku} · ${r.name}`, value: onHand / demandRate });
    }
  }
  daysOfSupplyRows.sort((a, b) => a.value - b.value);

  const leadTimeTrend = await client.query(`
    WITH bounds AS (SELECT CURRENT_DATE AS latest)
    SELECT
      (ordered_date > bounds.latest - INTERVAL '90 days') AS is_current,
      AVG(received_date - ordered_date)::float8 AS avg_lead
    FROM fact_purchase_order, bounds
    WHERE ordered_date > bounds.latest - INTERVAL '180 days' AND ordered_date <= bounds.latest
    GROUP BY is_current
  `);
  const curLead = leadTimeTrend.rows.find((r) => r.is_current)?.avg_lead ?? null;
  const prevLead = leadTimeTrend.rows.find((r) => !r.is_current)?.avg_lead ?? null;

  const kpis: Kpi[] = [
    kpi("stock_on_hand", "Stock on Hand", "units", curOnHandTotal, prevOnHandTotal, "context_dependent", `Across ${skuCount} SKUs`),
    kpi("stockout_rate", "Stockout Rate", "percent", curStockoutRate, prevStockoutRate, "lower_is_better", "Alert threshold 3%"),
    kpi(
      "days_of_supply",
      "Avg Days of Supply",
      "days",
      daysOfSupplyRows.length ? daysOfSupplyRows.reduce((s2, r) => s2 + r.value, 0) / daysOfSupplyRows.length : 0,
      daysOfSupplyRows.length ? daysOfSupplyRows.reduce((s2, r) => s2 + r.value, 0) / daysOfSupplyRows.length : 0,
      "higher_is_better",
      "vs 10-30d typical (no 7d-prior trend computed)",
    ),
    kpi("dead_stock_value", "Dead Stock Value", "SGD", deadStockValue, deadStockPrevValue, "lower_is_better", "No sale in 60 days"),
    kpi(
      "supplier_lead_time_days",
      "Avg Lead Time",
      "days",
      curLead == null ? 0 : num(curLead),
      prevLead == null ? 0 : num(prevLead),
      "lower_is_better",
      "Trailing 90 days, all suppliers",
    ),
    kpi("reorder_point_breach_count", "Reorder Breaches", "count", curBreaches, prevBreaches, "lower_is_better", "Proxy reorder point — see docs"),
  ];

  const leadTimeChart = supplierLeadTime.rows
    .map((r) => ({ label: r.supplier_id, value: Math.round(num(r.avg_lead_time) * 10) / 10 }))
    .slice(0, 8);
  const promisedRows = await client.query(`SELECT supplier_id, lead_time_days FROM dim_supplier`);
  const promisedBySupplier = new Map<string, number>(promisedRows.rows.map((r) => [r.supplier_id, num(r.lead_time_days)]));

  const deadStockCategoryList = [...deadStockByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));

  const charts: DashboardChartBlock[] = [
    {
      title: "Supplier lead time · promised vs actual (trailing 90 days)",
      kind: "bars",
      unit: "days",
      seriesLabels: ["Actual", "Promised"],
      data: leadTimeChart.map((r) => ({ label: r.label, value: r.value, compare: promisedBySupplier.get(r.label) ?? 0 })),
    },
    {
      title: "Days of supply · lowest SKUs",
      kind: "list",
      unit: "days",
      data: daysOfSupplyRows.slice(0, 5).map((r) => ({ label: r.label, value: Math.round(r.value * 10) / 10 })),
    },
    {
      title: "Dead stock by category",
      kind: "list",
      unit: "SGD",
      data: deadStockCategoryList,
    },
  ];

  return { kpis, charts };
}

// ── accounting domain ────────────────────────────────────────────────────

async function accountingDashboard(client: PoolClient): Promise<DomainDashboard> {
  const salesWindow = await client.query(`
    WITH bounds AS (SELECT CURRENT_DATE AS latest)
    SELECT
      (f.date > bounds.latest - INTERVAL '30 days') AS is_current,
      COALESCE(SUM(f.line_total_sgd), 0) AS revenue,
      COALESCE(SUM(f.qty * f.unit_cost_sgd), 0) AS cogs,
      COALESCE(SUM((s.list_price_sgd - f.unit_price_sgd) * f.qty), 0) AS discount
    FROM fact_order_line f
    JOIN dim_sku s ON s.sku = f.sku, bounds
    WHERE f.date > bounds.latest - INTERVAL '60 days' AND f.date <= bounds.latest
    GROUP BY is_current
  `);
  const cur = salesWindow.rows.find((r) => r.is_current) ?? {};
  const prev = salesWindow.rows.find((r) => !r.is_current) ?? {};
  const curRevenue = num(cur.revenue);
  const prevRevenue = num(prev.revenue);
  const curMargin = curRevenue ? (curRevenue - num(cur.cogs)) / curRevenue : 0;
  const prevMargin = prevRevenue ? (prevRevenue - num(prev.cogs)) / prevRevenue : 0;
  const curDiscount = Math.max(num(cur.discount), 0);
  const prevDiscount = Math.max(num(prev.discount), 0);

  const cash = await client.query(`
    WITH bounds AS (SELECT CURRENT_DATE AS latest),
    inflow AS (
      SELECT (paid_date > bounds.latest - INTERVAL '14 days') AS is_current, COALESCE(SUM(amount_sgd), 0) AS amt
      FROM fact_invoice, bounds
      WHERE paid_date IS NOT NULL AND paid_date > bounds.latest - INTERVAL '28 days' AND paid_date <= bounds.latest
      GROUP BY is_current
    ),
    outflow AS (
      SELECT (paid_date > bounds.latest - INTERVAL '14 days') AS is_current, COALESCE(SUM(amount_sgd), 0) AS amt
      FROM fact_bill, bounds
      WHERE paid_date IS NOT NULL AND paid_date > bounds.latest - INTERVAL '28 days' AND paid_date <= bounds.latest
      GROUP BY is_current
    )
    SELECT
      (SELECT amt FROM inflow WHERE is_current) AS cur_in,
      (SELECT amt FROM inflow WHERE NOT is_current) AS prev_in,
      (SELECT amt FROM outflow WHERE is_current) AS cur_out,
      (SELECT amt FROM outflow WHERE NOT is_current) AS prev_out
  `);
  const cf = cash.rows[0] ?? {};
  const curCashflow = num(cf.cur_in) - num(cf.cur_out);
  const prevCashflow = num(cf.prev_in) - num(cf.prev_out);

  const ageing = await client.query(`
    SELECT
      COALESCE(SUM(amount_sgd) FILTER (WHERE status != 'paid' AND CURRENT_DATE - due_date > 60), 0) AS ar_60,
      COALESCE(SUM(amount_sgd) FILTER (WHERE status != 'paid' AND CURRENT_DATE - due_date > 30 AND CURRENT_DATE - due_date <= 60), 0) AS ar_30_60,
      COALESCE(SUM(amount_sgd) FILTER (WHERE status != 'paid' AND CURRENT_DATE - due_date >= 1 AND CURRENT_DATE - due_date <= 30), 0) AS ar_1_30,
      COALESCE(SUM(amount_sgd) FILTER (WHERE status != 'paid' AND CURRENT_DATE - due_date < 1), 0) AS ar_current
    FROM fact_invoice
  `);
  const apDueSoon = await client.query(`
    SELECT
      COALESCE(SUM(amount_sgd), 0) AS due_soon,
      COUNT(DISTINCT supplier_id)::int AS supplier_count
    FROM fact_bill
    WHERE status != 'paid' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
  `);
  const a = ageing.rows[0];
  const ap = apDueSoon.rows[0];

  const kpis: Kpi[] = [
    kpi("gross_margin_pct", "Gross Margin", "percent", curMargin, prevMargin, "higher_is_better", "vs 30-45% typical"),
    kpi("cogs", "COGS", "SGD", num(cur.cogs), num(prev.cogs), "lower_is_better", "Last 30 days"),
    kpi("discount_impact", "Discount Impact", "SGD", curDiscount, prevDiscount, "lower_is_better", "Revenue given up, last 30 days"),
    kpi("net_cashflow", "Net Cash Flow", "SGD", curCashflow, prevCashflow, "higher_is_better", "Realized, last 14 days"),
    kpi("ar_ageing", "AR Ageing 60d+", "SGD", num(a.ar_60), num(a.ar_60), "lower_is_better", "Open invoices only"),
    kpi("ap_ageing", "AP Due This Week", "SGD", num(ap.due_soon), num(ap.due_soon), "context_dependent", `${num(ap.supplier_count)} suppliers`),
  ];

  const marginTrend = await client.query(`
    WITH bounds AS (SELECT CURRENT_DATE AS latest)
    SELECT
      to_char(date_trunc('month', f.date), 'Mon') AS label,
      date_trunc('month', f.date) AS month,
      COALESCE(SUM(f.line_total_sgd), 0) AS revenue,
      COALESCE(SUM(f.qty * f.unit_cost_sgd), 0) AS cogs
    FROM fact_order_line f, bounds
    WHERE f.date > bounds.latest - INTERVAL '6 months' AND f.date <= bounds.latest
    GROUP BY date_trunc('month', f.date)
    ORDER BY month
  `);
  const discountByCategory = await client.query(`
    WITH bounds AS (SELECT CURRENT_DATE AS latest)
    SELECT s.category, COALESCE(SUM((s.list_price_sgd - f.unit_price_sgd) * f.qty), 0) AS discount
    FROM fact_order_line f
    JOIN dim_sku s ON s.sku = f.sku, bounds
    WHERE f.date > bounds.latest - INTERVAL '30 days' AND f.date <= bounds.latest
    GROUP BY s.category
    ORDER BY discount DESC
    LIMIT 6
  `);

  const charts: DashboardChartBlock[] = [
    {
      title: "Gross margin trend · last 6 months",
      kind: "bars",
      unit: "percent",
      data: marginTrend.rows.map((r) => ({
        label: r.label,
        value: num(r.revenue) ? (num(r.revenue) - num(r.cogs)) / num(r.revenue) : 0,
      })),
    },
    {
      title: "AR ageing by bucket",
      kind: "list",
      unit: "SGD",
      data: [
        { label: "Current", value: num(a.ar_current) },
        { label: "1-30 days", value: num(a.ar_1_30) },
        { label: "31-60 days", value: num(a.ar_30_60) },
        { label: "60+ days", value: num(a.ar_60) },
      ],
    },
    {
      title: "Discount spend by category (last 30 days)",
      kind: "list",
      unit: "SGD",
      data: discountByCategory.rows.map((r) => ({ label: r.category, value: Math.max(num(r.discount), 0) })),
    },
  ];

  return { kpis, charts };
}

export async function liveDomainDashboard(tenantId: string, domain: Domain): Promise<DomainDashboard> {
  return withTenant(tenantId, (client) => {
    if (domain === "sales") return salesDashboard(client);
    if (domain === "inventory") return inventoryDashboard(client);
    return accountingDashboard(client);
  });
}

// ── metric series ────────────────────────────────────────────────────────

const _SALES_SERIES_METRICS: Record<string, string> = {
  gross_revenue: "COALESCE(SUM(f.line_total_sgd), 0)",
  net_revenue: "COALESCE(SUM(CASE WHEN NOT f.is_refund THEN f.line_total_sgd ELSE 0 END), 0)",
  units_sold: "COALESCE(SUM(CASE WHEN NOT f.is_refund THEN f.qty ELSE 0 END), 0)",
  category_revenue: "COALESCE(SUM(CASE WHEN NOT f.is_refund THEN f.line_total_sgd ELSE 0 END), 0)",
};

async function salesSeries(
  client: PoolClient,
  metricId: string,
  dimensions: Record<string, string>,
): Promise<MetricSeries> {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (dimensions.channel) {
    params.push(dimensions.channel);
    filters.push(`f.channel = $${params.length}`);
  }
  if (dimensions.category) {
    params.push(dimensions.category);
    filters.push(`s.category = $${params.length}`);
  }
  if (dimensions.sku) {
    params.push(dimensions.sku);
    filters.push(`f.sku = $${params.length}`);
  }
  const whereExtra = filters.length ? `AND ${filters.join(" AND ")}` : "";

  if (metricId === "average_order_value") {
    const { rows } = await client.query(
      `
      WITH bounds AS (SELECT CURRENT_DATE AS latest)
      SELECT
        f.date,
        COALESCE(SUM(CASE WHEN NOT f.is_refund THEN f.line_total_sgd ELSE 0 END), 0) AS net,
        COUNT(DISTINCT f.order_id) FILTER (WHERE NOT f.is_refund)::int AS orders
      FROM fact_order_line f
      JOIN dim_sku s ON s.sku = f.sku, bounds
      WHERE f.date > bounds.latest - INTERVAL '30 days' AND f.date <= bounds.latest ${whereExtra}
      GROUP BY f.date
      ORDER BY f.date
      `,
      params,
    );
    return {
      metric_id: metricId,
      grain: "day",
      dimensions,
      points: rows.map((r) => ({
        period: r.date.toISOString().slice(0, 10),
        value: r.orders ? num(r.net) / num(r.orders) : 0,
      })),
    };
  }

  if (metricId === "return_rate") {
    const { rows } = await client.query(
      `
      WITH bounds AS (SELECT CURRENT_DATE AS latest)
      SELECT
        f.date,
        COALESCE(SUM(f.line_total_sgd), 0) AS revenue,
        COALESCE(SUM(CASE WHEN f.is_refund THEN f.line_total_sgd ELSE 0 END), 0) AS refunds
      FROM fact_order_line f
      JOIN dim_sku s ON s.sku = f.sku, bounds
      WHERE f.date > bounds.latest - INTERVAL '30 days' AND f.date <= bounds.latest ${whereExtra}
      GROUP BY f.date
      ORDER BY f.date
      `,
      params,
    );
    return {
      metric_id: metricId,
      grain: "day",
      dimensions,
      points: rows.map((r) => ({
        period: r.date.toISOString().slice(0, 10),
        value: num(r.revenue) ? num(r.refunds) / num(r.revenue) : 0,
      })),
    };
  }

  if (metricId === "cogs" || metricId === "gross_margin_pct" || metricId === "discount_impact") {
    const { rows } = await client.query(
      `
      WITH bounds AS (SELECT CURRENT_DATE AS latest)
      SELECT
        f.date,
        COALESCE(SUM(f.line_total_sgd), 0) AS revenue,
        COALESCE(SUM(f.qty * f.unit_cost_sgd), 0) AS cogs,
        COALESCE(SUM((s.list_price_sgd - f.unit_price_sgd) * f.qty), 0) AS discount
      FROM fact_order_line f
      JOIN dim_sku s ON s.sku = f.sku, bounds
      WHERE f.date > bounds.latest - INTERVAL '30 days' AND f.date <= bounds.latest ${whereExtra}
      GROUP BY f.date
      ORDER BY f.date
      `,
      params,
    );
    return {
      metric_id: metricId,
      grain: "day",
      dimensions,
      points: rows.map((r) => {
        const revenue = num(r.revenue);
        let value: number;
        if (metricId === "cogs") value = num(r.cogs);
        else if (metricId === "gross_margin_pct") value = revenue ? (revenue - num(r.cogs)) / revenue : 0;
        else value = Math.max(num(r.discount), 0);
        return { period: r.date.toISOString().slice(0, 10), value };
      }),
    };
  }

  const expr = _SALES_SERIES_METRICS[metricId];
  const { rows } = await client.query(
    `
    WITH bounds AS (SELECT CURRENT_DATE AS latest)
    SELECT f.date, ${expr} AS value
    FROM fact_order_line f
    JOIN dim_sku s ON s.sku = f.sku, bounds
    WHERE f.date > bounds.latest - INTERVAL '30 days' AND f.date <= bounds.latest ${whereExtra}
    GROUP BY f.date
    ORDER BY f.date
    `,
    params,
  );
  return {
    metric_id: metricId,
    grain: "day",
    dimensions,
    points: rows.map((r) => ({ period: r.date.toISOString().slice(0, 10), value: num(r.value) })),
  };
}

async function stockOnHandSeries(client: PoolClient, dimensions: Record<string, string>): Promise<MetricSeries> {
  const skuFilter = dimensions.sku ? `AND sku = $1` : "";
  const params = dimensions.sku ? [dimensions.sku] : [];
  const { rows } = await client.query(
    `
    WITH bounds AS (SELECT CURRENT_DATE AS latest),
    daily AS (
      SELECT date, SUM(on_hand_after) AS total
      FROM (
        SELECT DISTINCT ON (date, sku) date, sku, on_hand_after
        FROM fact_stock_movement, bounds
        WHERE date > bounds.latest - INTERVAL '30 days' AND date <= bounds.latest ${skuFilter}
        ORDER BY date, sku, movement_id DESC
      ) last_per_day
      GROUP BY date
    )
    SELECT date, total FROM daily ORDER BY date
    `,
    params,
  );
  return {
    metric_id: "stock_on_hand",
    grain: "day",
    dimensions,
    points: rows.map((r) => ({ period: r.date.toISOString().slice(0, 10), value: num(r.total) })),
  };
}

async function netCashflowSeries(client: PoolClient): Promise<MetricSeries> {
  const { rows } = await client.query(`
    WITH bounds AS (SELECT CURRENT_DATE AS latest),
    days AS (
      SELECT generate_series(bounds.latest - INTERVAL '29 days', bounds.latest, '1 day')::date AS d
      FROM bounds
    ),
    inflow AS (SELECT paid_date AS d, SUM(amount_sgd) AS amt FROM fact_invoice WHERE paid_date IS NOT NULL GROUP BY paid_date),
    outflow AS (SELECT paid_date AS d, SUM(amount_sgd) AS amt FROM fact_bill WHERE paid_date IS NOT NULL GROUP BY paid_date)
    SELECT days.d AS date, COALESCE(inflow.amt, 0) - COALESCE(outflow.amt, 0) AS value
    FROM days
    LEFT JOIN inflow ON inflow.d = days.d
    LEFT JOIN outflow ON outflow.d = days.d
    ORDER BY days.d
  `);
  return {
    metric_id: "net_cashflow",
    grain: "day",
    dimensions: {},
    points: rows.map((r) => ({ period: r.date.toISOString().slice(0, 10), value: num(r.value) })),
  };
}

const LIVE_SALES_SERIES = new Set([
  "gross_revenue",
  "net_revenue",
  "units_sold",
  "category_revenue",
  "average_order_value",
  "return_rate",
  "cogs",
  "gross_margin_pct",
  "discount_impact",
]);

/**
 * Metrics NOT covered here (channel_mix_share, inventory_turnover, dead_stock_value,
 * supplier_lead_time_days, purchase_order_delay, reorder_point_breach_count,
 * damage_shrinkage_rate, cogs_ratio, ar_ageing, ap_ageing, operating_expense,
 * delivery_attach_rate, days_of_supply, stockout_rate) fall back to the same
 * deterministic mock series they always used — each needs either data this schema
 * doesn't have (delivery/assembly, damage, opex) or an expensive per-day
 * recomputation (ageing buckets, days-of-supply, stockout rate) not built yet.
 * Falling back to labeled mock beats a live query that's silently wrong.
 */
export async function liveMetricSeries(
  tenantId: string,
  metricId: string,
  dimensions: Record<string, string>,
): Promise<MetricSeries> {
  return withTenant(tenantId, async (client) => {
    if (LIVE_SALES_SERIES.has(metricId)) return salesSeries(client, metricId, dimensions);
    if (metricId === "stock_on_hand") return stockOnHandSeries(client, dimensions);
    if (metricId === "net_cashflow") return netCashflowSeries(client);
    const unit = METRICS.find((m) => m.id === metricId)?.unit;
    return mockSeries(metricId, dimensions, unit);
  });
}

// ── signals (threshold_breach detector only) ────────────────────────────

const DOMAIN_BY_METRIC: Record<string, Domain> = {
  return_rate: "sales",
  stockout_rate: "inventory",
  supplier_lead_time_days: "inventory",
  ar_ageing: "accounting",
  ap_ageing: "accounting",
};

async function computeSignals(client: PoolClient): Promise<Signal[]> {
  const now = new Date().toISOString();
  const signals: Signal[] = [];

  const returnRateThreshold = 0.08;
  const supplierDelayThreshold = 5;
  const overdueDaysThreshold = 60;

  const rr = await client.query(`
    SELECT
      COALESCE(SUM(CASE WHEN is_refund THEN line_total_sgd ELSE 0 END), 0) AS refunds,
      COALESCE(SUM(line_total_sgd), 0) AS revenue
    FROM fact_order_line
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
  `);
  const { refunds, revenue } = rr.rows[0];
  if (num(revenue) > 0) {
    const rate = num(refunds) / num(revenue);
    if (rate > returnRateThreshold) {
      signals.push({
        signal_id: "sig-return-rate",
        detected_at: now,
        metric_id: "return_rate",
        grain: "day",
        dimensions: {},
        period: new Date().toISOString().slice(0, 10),
        observed: Math.round(rate * 1000) / 1000,
        expected: returnRateThreshold,
        deviation: (rate - returnRateThreshold) / returnRateThreshold,
        score: Math.min(1, rate / returnRateThreshold - 1),
        dollar_impact_est: -Math.round(num(refunds)),
        detector: "threshold_breach",
        status: "open",
      });
    }
  }

  const stockoutRows = await client.query(`
    WITH latest AS (
      SELECT DISTINCT ON (sku) sku, on_hand_after
      FROM fact_stock_movement
      WHERE date <= CURRENT_DATE
      ORDER BY sku, date DESC, movement_id DESC
    )
    SELECT COUNT(*)::int AS n, (SELECT COUNT(*) FROM latest)::int AS total FROM latest WHERE on_hand_after <= 0
  `);
  const { n: outOfStock, total: skuTotal } = stockoutRows.rows[0];
  if (num(outOfStock) > 0) {
    signals.push({
      signal_id: "sig-stockout",
      detected_at: now,
      metric_id: "stockout_rate",
      grain: "day",
      dimensions: {},
      period: new Date().toISOString().slice(0, 10),
      observed: num(outOfStock),
      // No natural "expected" baseline for a raw count; 0 is the threshold, not a
      // measured typical level. score/deviation are best-effort ranking aids, not
      // calibrated anomaly scores (only threshold_breach is implemented — see file header).
      expected: 0,
      deviation: num(skuTotal) ? num(outOfStock) / num(skuTotal) : 0,
      score: Math.min(1, num(outOfStock) / Math.max(num(skuTotal), 1)),
      dollar_impact_est: 0,
      detector: "threshold_breach",
      status: "open",
    });
  }

  const delayRows = await client.query(
    `
    SELECT supplier_id, AVG(received_date - ordered_date)::float8 AS avg_delay
    FROM fact_purchase_order
    GROUP BY supplier_id
    HAVING AVG(received_date - ordered_date) > $1
    ORDER BY avg_delay DESC
    `,
    [supplierDelayThreshold],
  );
  for (const r of delayRows.rows) {
    signals.push({
      signal_id: `sig-supplier-delay-${r.supplier_id}`,
      detected_at: now,
      metric_id: "supplier_lead_time_days",
      grain: "week",
      dimensions: { supplier: r.supplier_id },
      period: new Date().toISOString().slice(0, 10),
      observed: Math.round(num(r.avg_delay) * 10) / 10,
      expected: supplierDelayThreshold,
      deviation: (num(r.avg_delay) - supplierDelayThreshold) / supplierDelayThreshold,
      score: Math.min(1, num(r.avg_delay) / supplierDelayThreshold - 1),
      dollar_impact_est: 0,
      detector: "threshold_breach",
      status: "open",
    });
  }

  for (const [kind, table, metricId] of [
    ["receivable", "fact_invoice", "ar_ageing"],
    ["payable", "fact_bill", "ap_ageing"],
  ] as const) {
    const overdue = await client.query(
      `
      SELECT COALESCE(SUM(amount_sgd), 0) AS amt, COUNT(*)::int AS n
      FROM ${table}
      WHERE status != 'paid' AND CURRENT_DATE - due_date > $1
      `,
      [overdueDaysThreshold],
    );
    const { amt, n } = overdue.rows[0];
    if (num(n) > 0) {
      signals.push({
        signal_id: `sig-${kind}-overdue`,
        detected_at: now,
        metric_id: metricId,
        grain: "week",
        dimensions: {},
        period: new Date().toISOString().slice(0, 10),
        observed: Math.round(num(amt)),
        expected: 0,
        deviation: 1,
        score: Math.min(1, num(amt) / 50_000),
        dollar_impact_est: -Math.round(num(amt)),
        detector: "threshold_breach",
        status: "open",
      });
    }
  }

  return signals.sort((a, b) => b.score - a.score);
}

export interface LiveSignalFilter {
  status?: SignalStatus;
  domain?: Domain;
  limit?: number;
}

export async function liveSignals(tenantId: string, filter: LiveSignalFilter = {}): Promise<Signal[]> {
  const all = await withTenant(tenantId, computeSignals);
  // Every live signal is always "open" — there's no persistence layer to record an
  // acknowledge/resolve action against (these are recomputed fresh every request,
  // not read from a stored detector run). Filtering by any other status is honestly empty.
  return all
    .filter((s) => !filter.status || s.status === filter.status)
    .filter((s) => !filter.domain || DOMAIN_BY_METRIC[s.metric_id] === filter.domain)
    .slice(0, filter.limit ?? 100);
}

export async function liveSignal(tenantId: string, signalId: string): Promise<Signal | null> {
  const all = await withTenant(tenantId, computeSignals);
  return all.find((s) => s.signal_id === signalId) ?? null;
}

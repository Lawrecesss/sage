// Mock fixtures for building the UI before the warehouse/detector/briefing lanes land.
// Entities come from the simulator persona ("Lian & Co.", Singapore homeware) and
// metric ids from metrics.yaml, so swapping to live data should not change any UI.

import type { Brief, MetricSeries, MetricUnit, Signal } from "@/lib/types";

export const MOCK_TODAY = "2026-09-18";

export const MOCK_SIGNALS: Signal[] = [
  {
    signal_id: "sig-001",
    detected_at: "2026-09-18T23:00:00Z",
    metric_id: "gross_revenue",
    grain: "day",
    dimensions: { channel: "shopee" },
    period: MOCK_TODAY,
    observed: 18250,
    expected: 26400,
    deviation: -0.309,
    score: 0.92,
    dollar_impact_est: -8150,
    detector: "zscore_7d",
    status: "open",
  },
  {
    signal_id: "sig-002",
    detected_at: "2026-09-18T23:00:00Z",
    metric_id: "days_of_supply",
    grain: "day",
    dimensions: { sku: "LIN-0012", category: "Bedding & Linen" },
    period: MOCK_TODAY,
    observed: 2,
    expected: 14,
    deviation: -0.857,
    score: 0.81,
    dollar_impact_est: -3200,
    detector: "threshold_breach",
    status: "open",
  },
  {
    signal_id: "sig-003",
    detected_at: "2026-09-17T23:00:00Z",
    metric_id: "supplier_lead_time_days",
    grain: "week",
    dimensions: { supplier: "Lian Textile Mills" },
    period: "2026-W38",
    observed: 19,
    expected: 12,
    deviation: 0.583,
    score: 0.74,
    dollar_impact_est: -1100,
    detector: "zscore_7d",
    status: "acknowledged",
  },
  {
    signal_id: "sig-004",
    detected_at: "2026-09-18T23:00:00Z",
    metric_id: "gross_margin_pct",
    grain: "week",
    dimensions: { category: "Kitchen & Dining", channel: "lazada" },
    period: "2026-W38",
    observed: 0.21,
    expected: 0.36,
    deviation: -0.417,
    score: 0.69,
    dollar_impact_est: -2750,
    detector: "wow_change",
    status: "open",
  },
  {
    signal_id: "sig-005",
    detected_at: "2026-09-18T23:00:00Z",
    metric_id: "discount_impact",
    grain: "week",
    dimensions: { category: "Kitchen & Dining" },
    period: "2026-W38",
    observed: 6400,
    expected: 2100,
    deviation: 2.048,
    score: 0.66,
    dollar_impact_est: -4300,
    detector: "wow_change",
    status: "open",
  },
  {
    signal_id: "sig-006",
    detected_at: "2026-09-16T23:00:00Z",
    metric_id: "return_rate",
    grain: "week",
    dimensions: { category: "Lighting" },
    period: "2026-W38",
    observed: 0.14,
    expected: 0.05,
    deviation: 1.8,
    score: 0.58,
    dollar_impact_est: -1850,
    detector: "threshold_breach",
    status: "open",
  },
  {
    signal_id: "sig-007",
    detected_at: "2026-09-15T23:00:00Z",
    metric_id: "ar_ageing",
    grain: "week",
    dimensions: { ageing_bucket: "60+" },
    period: "2026-W38",
    observed: 41200,
    expected: 18000,
    deviation: 1.289,
    score: 0.52,
    dollar_impact_est: -23200,
    detector: "threshold_breach",
    status: "acknowledged",
  },
  {
    signal_id: "sig-008",
    detected_at: "2026-09-10T23:00:00Z",
    metric_id: "dead_stock_value",
    grain: "week",
    dimensions: { category: "Outdoor & Garden" },
    period: "2026-W37",
    observed: 12800,
    expected: 7400,
    deviation: 0.73,
    score: 0.41,
    dollar_impact_est: -5400,
    detector: "wow_change",
    status: "resolved",
  },
];

export const MOCK_BRIEF: Brief = {
  brief_id: "brief-2026-09-18",
  generated_at: "2026-09-19T07:00:00+08:00",
  period: MOCK_TODAY,
  headline:
    "A late linen supplier is starting to empty Shopee shelves. Kitchen & Dining discounts are eating margin without lifting volume.",
  kpis: [
    kpi("net_revenue", "Net revenue", "SGD", 61840, 70210, "higher_is_better", 64000, 0.08),
    kpi("gross_margin_pct", "Gross margin", "percent", 0.338, 0.371, "higher_is_better", 0.37, 0.02),
    kpi("units_sold", "Units sold", "units", 1432, 1510, "higher_is_better", 1480, 0.07),
    kpi("stockout_rate", "Stockout rate", "percent", 0.046, 0.021, "lower_is_better", 0.022, 0.25),
  ],
  items: [
    {
      rank: 1,
      title: "Shopee revenue down 31% as a best-selling linen SKU runs out",
      severity: "high",
      domain: "sales",
      summary:
        "Shopee sales fell to S$18.3K against S$26.4K expected. The drop is concentrated in Bedding & Linen, where LIN-0012 has two days of cover left.",
      dollar_impact_est: -11350,
      signal_ids: ["sig-001", "sig-002", "sig-003"],
      causal_chain: [
        {
          domain: "inventory",
          claim: "Lian Textile Mills lead time slipped from 12 to 19 days",
          metric_id: "supplier_lead_time_days",
        },
        {
          domain: "inventory",
          claim: "LIN-0012 fell to 2 days of supply before the reorder landed",
          metric_id: "days_of_supply",
        },
        { domain: "sales", claim: "Shopee daily revenue dropped 31% below baseline", metric_id: "gross_revenue" },
      ],
      recommended_action:
        "Expedite PO for LIN-0012 or source a substitute from Saigon Linen House, and pause Shopee ads on the SKU until stock lands.",
    },
    {
      rank: 2,
      title: "Kitchen & Dining discount cut margin without lifting volume",
      severity: "medium",
      domain: "accounting",
      summary:
        "Discounts on Kitchen & Dining tripled week on week, but units sold stayed flat. Gross margin on Lazada fell from 36% to 21%.",
      dollar_impact_est: -7050,
      signal_ids: ["sig-004", "sig-005"],
      causal_chain: [
        { domain: "accounting", claim: "Discount spend rose to S$6.4K vs S$2.1K typical", metric_id: "discount_impact" },
        { domain: "sales", claim: "Units sold did not move with the markdown", metric_id: "units_sold" },
        { domain: "accounting", claim: "Lazada category margin fell 15 points", metric_id: "gross_margin_pct" },
      ],
      recommended_action: "End the Kitchen & Dining promotion on Lazada; it is not converting.",
    },
    {
      rank: 3,
      title: "Lighting returns nearly tripled",
      severity: "medium",
      domain: "sales",
      summary: "Return rate in Lighting hit 14% against a 5% norm. Worth checking for a quality issue with one SKU.",
      dollar_impact_est: -1850,
      signal_ids: ["sig-006"],
      causal_chain: [],
      recommended_action: "Pull the return reasons for Lighting this week and check whether one SKU dominates.",
    },
  ],
};

function kpi(
  metric_id: string,
  label: string,
  unit: Brief["kpis"][number]["unit"],
  value: number,
  previous: number,
  direction: Brief["kpis"][number]["direction"],
  base: number,
  noise: number,
): Brief["kpis"][number] {
  const spark = seededSeries(metric_id, 13, base, noise);
  spark.push(value);
  return { metric_id, label, unit, value, previous, direction, spark };
}

/** A plausible level for a metric with no signal to anchor it, so a percent metric
 *  doesn't plot like a dollar one. */
const BASE_BY_UNIT: Record<MetricUnit, number> = {
  SGD: 48_000,
  units: 1_200,
  percent: 0.35,
  ratio: 3,
  days: 14,
  count: 6,
};

/** Deterministic 30-period series for any metric, with the signal's anomaly at the end. */
export function mockSeries(
  metric_id: string,
  dimensions: Record<string, string> = {},
  unit: MetricUnit = "units",
): MetricSeries {
  const signal = MOCK_SIGNALS.find(
    (s) => s.metric_id === metric_id && JSON.stringify(s.dimensions) === JSON.stringify(dimensions),
  );
  const base = signal?.expected ?? BASE_BY_UNIT[unit];
  const values = seededSeries(metric_id + JSON.stringify(dimensions), 30, base, 0.06);
  if (signal) values[values.length - 1] = signal.observed;

  const end = new Date(`${MOCK_TODAY}T00:00:00Z`);
  const points = values.map((value, i) => {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - (values.length - 1 - i));
    return { period: d.toISOString().slice(0, 10), value, expected: base };
  });
  return { metric_id, grain: "day", dimensions, points };
}

/** Seeded noise around `base` — stable across renders so server/client markup matches. */
export function seededSeries(seed: string, n: number, base: number, noise: number): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, (_, i) => {
    const weekly = 1 + 0.05 * Math.sin((i / 7) * 2 * Math.PI);
    return base * weekly * (1 + (rand() - 0.5) * 2 * noise);
  });
}

// ── Brief history ────────────────────────────────────────────────────────
// Past morning briefs, newest first. MOCK_BRIEF is today's; the rest are the
// archive the History page lists.

const OLDER_BRIEFS: Brief[] = [
  {
    brief_id: "brief-2026-09-17",
    generated_at: "2026-09-18T07:00:00+08:00",
    period: "2026-09-17",
    headline: "Lian Textile Mills is running a week late on two open POs. Everything else is within normal range.",
    kpis: [],
    items: [
      {
        rank: 1,
        title: "Two linen POs now a week past their promised date",
        severity: "medium",
        domain: "inventory",
        summary:
          "PO-3381 and PO-3396 from Lian Textile Mills were promised on 10 Sep and have not arrived. Cover on the affected SKUs is under two weeks.",
        dollar_impact_est: -4200,
        signal_ids: ["sig-003"],
        causal_chain: [
          {
            domain: "inventory",
            claim: "Lead time moved from 12 to 19 days across the supplier's recent POs",
            metric_id: "supplier_lead_time_days",
          },
          { domain: "inventory", claim: "Bedding & Linen cover fell below 14 days", metric_id: "days_of_supply" },
        ],
        recommended_action: "Chase Lian Textile Mills for a firm date before Bedding & Linen cover runs out.",
      },
    ],
  },
  {
    brief_id: "brief-2026-09-16",
    generated_at: "2026-09-17T07:00:00+08:00",
    period: "2026-09-16",
    headline: "Lighting returns are running triple their usual rate. Sales and cash are normal.",
    kpis: [],
    items: [
      {
        rank: 1,
        title: "Lighting return rate hit 14%",
        severity: "medium",
        domain: "sales",
        summary: "Returns in Lighting reached 14% against a 5% norm, concentrated in one pendant lamp SKU.",
        dollar_impact_est: -1850,
        signal_ids: ["sig-006"],
        causal_chain: [],
        recommended_action: "Check return reasons for the Lighting category.",
      },
    ],
  },
  {
    brief_id: "brief-2026-09-15",
    generated_at: "2026-09-16T07:00:00+08:00",
    period: "2026-09-15",
    headline: "Trade accounts are paying later — S$41.2K is now more than 60 days overdue.",
    kpis: [],
    items: [
      {
        rank: 1,
        title: "AR over 60 days more than doubled",
        severity: "high",
        domain: "accounting",
        summary:
          "Three trade accounts moved into the 60+ day bucket, taking it from S$18K to S$41.2K in four weeks.",
        dollar_impact_est: -23200,
        signal_ids: ["sig-007"],
        causal_chain: [
          { domain: "accounting", claim: "60+ day AR bucket rose 129%", metric_id: "ar_ageing" },
          { domain: "accounting", claim: "Net cash flow fell for a third straight week", metric_id: "net_cashflow" },
        ],
        recommended_action: "Put the three overdue trade accounts on hold until they settle.",
      },
    ],
  },
  {
    brief_id: "brief-2026-09-11",
    generated_at: "2026-09-12T07:00:00+08:00",
    period: "2026-09-11",
    headline: "Outdoor & Garden stock is ageing out of season — S$12.8K has not moved in 90 days.",
    kpis: [],
    items: [
      {
        rank: 1,
        title: "Dead stock building in Outdoor & Garden",
        severity: "low",
        domain: "inventory",
        summary: "Dead stock value rose 73% as the season ended with stock still on the shelf.",
        dollar_impact_est: -5400,
        signal_ids: ["sig-008"],
        causal_chain: [],
        recommended_action: "Plan an end-of-season markdown for Outdoor & Garden.",
      },
    ],
  },
];

/** Newest first. */
export const MOCK_BRIEF_HISTORY: Brief[] = [MOCK_BRIEF, ...OLDER_BRIEFS];

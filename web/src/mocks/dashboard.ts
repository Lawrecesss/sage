// Dashboard fixtures: one KPI set and chart set per domain, plus the recommended
// (affinity) metrics. Metric ids come from metrics.yaml; entities from the
// simulator persona ("Lian & Co.", Singapore homeware).

import type { DomainDashboard, Kpi, RecommendedMetric } from "@/lib/types";
import { seededSeries } from "./fixtures";

function kpi(
  metric_id: string,
  label: string,
  unit: Kpi["unit"],
  value: number,
  previous: number,
  direction: Kpi["direction"],
  sub: string,
): Kpi {
  return { metric_id, label, unit, value, previous, direction, sub, spark: seededSeries(metric_id, 12, value, 0.07) };
}

export const DASHBOARD: Record<"sales" | "inventory" | "accounting", DomainDashboard> = {
  sales: {
    kpis: [
      kpi("gross_revenue", "Gross Revenue", "SGD", 1_842_000, 1_731_000, "higher_is_better", "Month to date"),
      kpi("net_revenue", "Net Revenue", "SGD", 1_704_000, 1_618_000, "higher_is_better", "After returns"),
      kpi("average_order_value", "Average Order Value", "SGD", 186, 201, "context_dependent", "vs S$200 typical"),
      kpi("units_sold", "Units Sold", "units", 9_162, 9_480, "higher_is_better", "Month to date"),
      kpi("return_rate", "Return Rate", "percent", 0.061, 0.048, "lower_is_better", "vs 5% norm"),
      kpi("delivery_attach_rate", "Delivery Attach Rate", "percent", 0.38, 0.41, "higher_is_better", "Paid delivery"),
    ],
    charts: [
      {
        title: "Daily revenue · gross vs net",
        kind: "bars",
        unit: "SGD",
        seriesLabels: ["Gross", "Net"],
        data: [
          { label: "Mon", value: 58_400, compare: 54_100 },
          { label: "Tue", value: 61_200, compare: 56_800 },
          { label: "Wed", value: 59_700, compare: 55_200 },
          { label: "Thu", value: 64_100, compare: 59_400 },
          { label: "Fri", value: 72_800, compare: 67_300 },
          { label: "Sat", value: 81_400, compare: 74_900 },
          { label: "Sun", value: 43_900, compare: 40_600 },
        ],
      },
      {
        title: "Channel mix · share of net revenue",
        kind: "list",
        unit: "percent",
        data: [
          { label: "Shopee", value: 0.34 },
          { label: "Shopify", value: 0.29 },
          { label: "Lazada", value: 0.22 },
          { label: "Outlet", value: 0.15 },
        ],
      },
      {
        title: "Revenue by category",
        kind: "list",
        unit: "SGD",
        data: [
          { label: "Bedding & Linen", value: 412_000 },
          { label: "Kitchen & Dining", value: 338_000 },
          { label: "Storage & Organisation", value: 264_000 },
          { label: "Tableware & Glassware", value: 221_000 },
          { label: "Bath", value: 178_000 },
          { label: "Lighting", value: 143_000 },
        ],
      },
    ],
  },

  inventory: {
    kpis: [
      kpi("stock_on_hand", "Stock on Hand", "units", 42_180, 44_600, "context_dependent", "Across 1,204 SKUs"),
      kpi("stockout_rate", "Stockout Rate", "percent", 0.046, 0.021, "lower_is_better", "Alert threshold 3%"),
      kpi("days_of_supply", "Avg Days of Supply", "days", 11.4, 14.8, "higher_is_better", "vs 14d target"),
      kpi("dead_stock_value", "Dead Stock Value", "SGD", 128_400, 118_200, "lower_is_better", "No sale in 90d"),
      kpi("supplier_lead_time_days", "Avg Lead Time", "days", 14.6, 12.1, "lower_is_better", "Supplier average"),
      kpi("reorder_point_breach_count", "Reorder Breaches", "count", 7, 2, "lower_is_better", "No open PO"),
    ],
    charts: [
      {
        title: "Supplier lead time · promised vs actual",
        kind: "bars",
        unit: "days",
        seriesLabels: ["Actual", "Promised"],
        data: [
          { label: "Lian", value: 19, compare: 12 },
          { label: "Prosper", value: 11, compare: 10 },
          { label: "Selangor", value: 14, compare: 14 },
          { label: "Penang", value: 13, compare: 12 },
          { label: "Golden L.", value: 22, compare: 21 },
          { label: "Foshan", value: 24, compare: 21 },
        ],
      },
      {
        title: "Days of supply · lowest SKUs",
        kind: "list",
        unit: "days",
        data: [
          { label: "LIN-0012 · Linen duvet set", value: 2 },
          { label: "KIT-0043 · Enamel pot", value: 4 },
          { label: "STO-0088 · Rattan basket", value: 5 },
          { label: "TAB-0021 · Glass carafe", value: 8 },
          { label: "BAT-0009 · Waffle towel", value: 11 },
        ],
      },
      {
        title: "Dead stock by category",
        kind: "list",
        unit: "SGD",
        data: [
          { label: "Outdoor & Garden", value: 41_200 },
          { label: "Candles & Fragrance", value: 28_600 },
          { label: "Home Decor", value: 24_100 },
          { label: "Rugs & Soft Furnishing", value: 19_800 },
          { label: "Lighting", value: 14_700 },
        ],
      },
    ],
  },

  accounting: {
    kpis: [
      kpi("gross_margin_pct", "Gross Margin", "percent", 0.338, 0.371, "higher_is_better", "vs 37% Q2"),
      kpi("cogs", "COGS", "SGD", 1_128_000, 1_018_000, "lower_is_better", "Month to date"),
      kpi("discount_impact", "Discount Impact", "SGD", 86_400, 52_100, "lower_is_better", "Revenue given up"),
      kpi("net_cashflow", "Net Cash Flow", "SGD", 42_800, 61_300, "higher_is_better", "This week"),
      kpi("ar_ageing", "AR Ageing 60d+", "SGD", 41_200, 18_000, "lower_is_better", "3 trade accounts"),
      kpi("ap_ageing", "AP Due This Week", "SGD", 74_600, 69_200, "context_dependent", "5 suppliers"),
    ],
    charts: [
      {
        title: "Gross margin trend · last 6 months",
        kind: "bars",
        unit: "percent",
        data: [
          { label: "Apr", value: 0.382 },
          { label: "May", value: 0.376 },
          { label: "Jun", value: 0.371 },
          { label: "Jul", value: 0.364 },
          { label: "Aug", value: 0.351 },
          { label: "Sep", value: 0.338 },
        ],
      },
      {
        title: "AR ageing by bucket",
        kind: "list",
        unit: "SGD",
        data: [
          { label: "Current", value: 96_400 },
          { label: "1–30 days", value: 48_200 },
          { label: "31–60 days", value: 27_900 },
          { label: "60+ days", value: 41_200 },
        ],
      },
      {
        title: "Discount spend by category",
        kind: "list",
        unit: "SGD",
        data: [
          { label: "Kitchen & Dining", value: 34_800 },
          { label: "Bedding & Linen", value: 21_400 },
          { label: "Tableware & Glassware", value: 12_900 },
          { label: "Bath", value: 9_600 },
          { label: "Home Decor", value: 7_700 },
        ],
      },
    ],
  },
};

/** What the owner keeps asking about — drives the Recommended panel on the dashboard. */
export const RECOMMENDED: RecommendedMetric[] = [
  {
    metric_id: "stockout_rate",
    label: "Stockout Rate",
    domain: "inventory",
    unit: "percent",
    value: 0.046,
    previous: 0.021,
    direction: "lower_is_better",
    query_count: 48,
    tags: ["stockout", "reorder", "days-of-supply"],
    pinned: true,
    spark: [0.019, 0.021, 0.022, 0.026, 0.031, 0.038, 0.046],
    reason: "Asked about most often, and currently above its 3% alert threshold.",
  },
  {
    metric_id: "gross_revenue",
    label: "Gross Revenue",
    domain: "sales",
    unit: "SGD",
    value: 1_842_000,
    previous: 1_731_000,
    direction: "higher_is_better",
    query_count: 41,
    tags: ["revenue", "channel-mix", "daily"],
    pinned: true,
    spark: [1_610_000, 1_664_000, 1_702_000, 1_688_000, 1_731_000, 1_798_000, 1_842_000],
    reason: "Your default opening question most mornings.",
  },
  {
    metric_id: "gross_margin_pct",
    label: "Gross Margin",
    domain: "accounting",
    unit: "percent",
    value: 0.338,
    previous: 0.371,
    direction: "higher_is_better",
    query_count: 36,
    tags: ["margin", "cogs", "discount"],
    pinned: false,
    spark: [0.382, 0.376, 0.371, 0.364, 0.351, 0.344, 0.338],
    reason: "Six straight weeks of decline — the longest run of any metric you follow.",
  },
  {
    metric_id: "supplier_lead_time_days",
    label: "Supplier Lead Time",
    domain: "inventory",
    unit: "days",
    value: 14.6,
    previous: 12.1,
    direction: "lower_is_better",
    query_count: 29,
    tags: ["supplier", "purchase-order", "delay"],
    pinned: false,
    spark: [12.1, 12.4, 12.2, 13.0, 13.6, 14.1, 14.6],
    reason: "Appears upstream of the stockouts you asked about twice this week.",
  },
  {
    metric_id: "discount_impact",
    label: "Discount Impact",
    domain: "accounting",
    unit: "SGD",
    value: 86_400,
    previous: 52_100,
    direction: "lower_is_better",
    query_count: 22,
    tags: ["discount", "promotion", "margin"],
    pinned: false,
    spark: [44_200, 47_800, 52_100, 61_400, 72_900, 79_600, 86_400],
    reason: "Rising alongside the margin decline you follow.",
  },
  {
    metric_id: "average_order_value",
    label: "Average Order Value",
    domain: "sales",
    unit: "SGD",
    value: 186,
    previous: 201,
    direction: "context_dependent",
    query_count: 17,
    tags: ["aov", "basket", "mix"],
    pinned: false,
    spark: [204, 201, 199, 196, 192, 189, 186],
    reason: "Drifting below the S$200 baseline for your basket mix.",
  },
];

/** Query volume per metric, last 6 weeks — the affinity trend in the Recommended panel. */
export const QUERY_FREQUENCY: { week: string; counts: Record<string, number> }[] = [
  { week: "W33", counts: { stockout_rate: 6, gross_revenue: 5, gross_margin_pct: 4 } },
  { week: "W34", counts: { stockout_rate: 8, gross_revenue: 6, gross_margin_pct: 5 } },
  { week: "W35", counts: { stockout_rate: 7, gross_revenue: 7, gross_margin_pct: 5 } },
  { week: "W36", counts: { stockout_rate: 9, gross_revenue: 8, gross_margin_pct: 6 } },
  { week: "W37", counts: { stockout_rate: 12, gross_revenue: 10, gross_margin_pct: 9 } },
  { week: "W38", counts: { stockout_rate: 10, gross_revenue: 9, gross_margin_pct: 8 } },
];

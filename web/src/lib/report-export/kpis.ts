// Derives a small "at a glance" KPI strip from a report's chart blocks, so the export leads
// with numbers instead of only prose. There's no dedicated KPI block in the reply shape (see
// ContentBlock in lib/types.ts) — these are computed straight from each chart's own data, so
// no change to the agent's reply contract is needed.

import { formatAxis } from "@/lib/format";
import type { ChartBlock, ContentBlock, DataRow } from "@/lib/types";
import { plainText, type TableNode } from "./markdown-lite";

export type ReportKpi = {
  label: string;
  value: string;
  /** e.g. "vs previous period", omitted when there's nothing to compare against. */
  deltaLabel?: string;
  deltaDirection?: "up" | "down" | "flat";
};

const compact = new Intl.NumberFormat("en-SG", { notation: "compact", maximumFractionDigits: 1 });

function formatValue(v: number, unit?: string): string {
  if (unit === "SGD") return formatAxis(v, "SGD");
  if (unit === "pct" || unit === "percent") return `${compact.format(v)}%`;
  if (unit === "days") return `${compact.format(v)}d`;
  return unit ? `${compact.format(v)} ${unit}` : compact.format(v);
}

function numAt(row: DataRow, key: string): number | null {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Keeps a KPI card's label/delta line to roughly one wrapped line, so a long chart title or
 * category name can't push the delta text past the card's fixed height in the PDF export. */
function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function kpisForChart(block: ChartBlock): ReportKpi[] {
  const { chart, title } = block;

  if (chart.kind === "pie") {
    const key = chart.series[0]?.key;
    if (!key) return [];
    const rows = chart.data.map((row) => ({ label: String(row[chart.xKey] ?? ""), value: numAt(row, key) ?? 0 }));
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    const top = rows.reduce((best, r) => (r.value > best.value ? r : best), rows[0]);
    if (!total || !top) return [];
    return [
      {
        label: truncate(title, 42),
        value: `${Math.round((top.value / total) * 100)}%`,
        deltaLabel: truncate(`${top.label} · largest of ${rows.length}`, 46),
      },
    ];
  }

  return chart.series.slice(0, 3).map((s): ReportKpi | null => {
    const vals = chart.data.map((row) => numAt(row, s.key)).filter((v): v is number => v != null);
    if (!vals.length) return null;
    const latest = vals[vals.length - 1];
    const first = vals[0];
    const label = truncate(chart.series.length > 1 ? `${title} · ${s.label}` : title, 42);
    if (vals.length < 2 || first === 0) return { label, value: formatValue(latest, chart.unit) };
    const change = (latest - first) / Math.abs(first);
    const direction = Math.abs(change) < 0.005 ? "flat" : change > 0 ? "up" : "down";
    return {
      label,
      value: formatValue(latest, chart.unit),
      deltaLabel: `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}% vs first period shown`,
      deltaDirection: direction,
    };
  }).filter((k): k is ReportKpi => k !== null);
}

const MAX_KPIS = 6;

/** Pulls up to MAX_KPIS headline numbers out of the report's chart blocks, in block order. */
export function deriveKpis(blocks: ContentBlock[]): ReportKpi[] {
  const out: ReportKpi[] = [];
  for (const block of blocks) {
    if (block.type !== "chart") continue;
    out.push(...kpisForChart(block));
    if (out.length >= MAX_KPIS) break;
  }
  return out.slice(0, MAX_KPIS);
}

function directionFromChangeCell(s: string): ReportKpi["deltaDirection"] {
  const t = s.trim();
  if (t.startsWith("+")) return "up";
  if (t.startsWith("-") || t.startsWith("−")) return "down";
  if (/^flat$/i.test(t) || /^(0%?|0\.0%?)$/.test(t)) return "flat";
  return undefined;
}

/**
 * Fallback for reports that present their scorecard as a markdown table (`| Metric | This
 * period | Last period | Change |`) instead of a ```chart fence — a common shape for a plain
 * "today vs last week" report. Reads column 1 as the label, column 2 as the value, and (when
 * there are more than two columns) the last column as the delta, so that table gets its own
 * KPI strip too rather than only chart blocks producing one.
 */
export function deriveKpisFromTable(table: TableNode): ReportKpi[] {
  if (table.header.length < 2) return [];
  const changeCol = table.header.length > 2 ? table.header.length - 1 : -1;
  return table.rows
    .slice(0, MAX_KPIS)
    .map((row): ReportKpi | null => {
      const label = truncate(plainText(row[0] ?? []).trim(), 42);
      const value = plainText(row[1] ?? []).trim();
      if (!label || !value) return null;
      const changeCell = changeCol >= 0 ? plainText(row[changeCol] ?? []).trim() : "";
      return {
        label,
        value,
        deltaLabel: changeCell ? truncate(changeCell, 46) : undefined,
        deltaDirection: changeCell ? directionFromChangeCell(changeCell) : undefined,
      };
    })
    .filter((k): k is ReportKpi => k !== null);
}

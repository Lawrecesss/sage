// Standalone SVG for one ChartBlock, for the PDF (drawn as vectors via svg-to-pdfkit) and
// Excel (rasterized via resvg) exports. Same visual language as ChatChart.tsx — bar/line/area/
// pie, same series order and palette — but pure string-building: no DOM, no CSS variables.

import { formatAxis } from "@/lib/format";
import type { ChartSpec, DataRow } from "@/lib/types";
import { GRID, OTHER_COLOR, SURFACE, TEXT_MUTED, seriesColor } from "./palette";

const compact = new Intl.NumberFormat("en-SG", { notation: "compact", maximumFractionDigits: 1 });

function formatChartValue(v: number, unit?: string): string {
  if (unit === "SGD") return formatAxis(v, "SGD");
  if (unit === "pct" || unit === "percent") return `${compact.format(v)}%`;
  if (unit === "days") return `${compact.format(v)}d`;
  return unit ? `${compact.format(v)} ${unit}` : compact.format(v);
}

function numAt(row: DataRow, key: string): number | null {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Mirrors ChatChart.tsx's tickIndices exactly, so the PDF/Excel chart never shows fewer
 * category labels than the on-screen chat/report chart for the same data. */
function tickIndices(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const spaced = Math.floor((n - 1) / 2) + 1;
  const count = Math.max(2, Math.min(max, spaced));
  const step = (n - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0 || w <= 0) return "";
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

function linePath(vals: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  const segs: string[] = [];
  let open = false;
  vals.forEach((v, i) => {
    if (v == null) {
      open = false;
      return;
    }
    segs.push(`${open ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    open = true;
  });
  return segs.join(" ");
}

function areaPath(vals: (number | null)[], x: (i: number) => number, y: (v: number) => number, base: number): string {
  const runs: number[][] = [];
  let cur: number[] = [];
  vals.forEach((v, i) => {
    if (v == null) {
      if (cur.length) runs.push(cur);
      cur = [];
      return;
    }
    cur.push(i);
  });
  if (cur.length) runs.push(cur);
  return runs
    .filter((run) => run.length > 1)
    .map((run) => {
      const top = run.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(vals[i] as number).toFixed(1)}`).join(" ");
      const first = run[0];
      const last = run[run.length - 1];
      return `${top} L${x(last).toFixed(1)},${base.toFixed(1)} L${x(first).toFixed(1)},${base.toFixed(1)} Z`;
    })
    .join(" ");
}

export type RenderedSvg = {
  svg: string;
  width: number;
  height: number;
  /** Legend entries, already drawn into the SVG but also handed back for callers that want
   * to render their own (e.g. an Excel data table's column colors). */
  legend: { color: string; label: string }[];
};

const W = 640;
const CH = 260; // chart plot height, legend rows add on top of this
const M = { top: 16, right: 20, bottom: 34, left: 72 };
const LEGEND_ROW_H = 20;
const FONT = "Helvetica, Arial, sans-serif";

/** Renders one ChartBlock's ChartSpec as a self-contained SVG document (fixed pixel size). */
export function renderChartSvg(chart: ChartSpec, title: string): RenderedSvg {
  if (chart.kind === "pie") return renderPie(chart, title);
  return renderCartesian(chart, title);
}

function legendMarkup(legend: { color: string; label: string }[], top: number, left: number): string {
  return legend
    .map(
      (l, i) => `
      <rect x="${left}" y="${top + i * LEGEND_ROW_H + 4}" width="10" height="10" rx="2" fill="${l.color}" />
      <text x="${left + 16}" y="${top + i * LEGEND_ROW_H + 13}" font-size="12" font-family="${FONT}" fill="${TEXT_MUTED}">${esc(l.label)}</text>`,
    )
    .join("");
}

function renderCartesian(chart: ChartSpec, title: string): RenderedSvg {
  const { data, series, xKey, unit, yLabel } = chart;
  const n = data.length;
  const legend = series.length > 1 ? series.map((s, i) => ({ color: seriesColor(i), label: s.label })) : [];
  const height = CH + M.top + M.bottom + legend.length * LEGEND_ROW_H;

  if (!n || !series.length) {
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CH}"></svg>`, width: W, height: CH, legend: [] };
  }

  const values = series.flatMap((s) => data.map((row) => numAt(row, s.key)).filter((v): v is number => v != null));
  const dataMax = Math.max(0, ...values);
  const dataMin = Math.min(0, ...values);
  const pad = (dataMax - dataMin) * 0.1 || Math.abs(dataMax) * 0.1 || 1;
  const max = dataMax + pad;
  const min = dataMin - (dataMin < 0 ? pad : 0);

  const iw = W - M.left - M.right;
  const ih = CH - M.top - M.bottom;
  const x = (i: number) =>
    chart.kind === "bar" ? M.left + (iw / n) * (i + 0.5) : M.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => M.top + (1 - (v - min) / (max - min)) * ih;
  const base = y(Math.max(min, Math.min(0, max)));

  const yTicks = [0, 0.5, 1].map((t) => min + t * (max - min));
  const xTicks = tickIndices(n, chart.kind === "bar" ? Math.min(n, 10) : 6);

  const slot = iw / n;
  const groupWidth = Math.min(slot * 0.72, 40);
  const barW = chart.kind === "bar" ? Math.max(2, groupWidth / series.length - 2) : 0;

  const gridLines = yTicks
    .map(
      (t) => `
      <line x1="${M.left}" x2="${W - M.right}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}" />
      <text x="${M.left - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" font-family="${FONT}" fill="${TEXT_MUTED}">${esc(formatChartValue(t, unit))}</text>`,
    )
    .join("");

  const xLabels = xTicks
    .map((i) => {
      const anchor = chart.kind === "bar" ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle";
      return `<text x="${x(i)}" y="${CH - 8}" text-anchor="${anchor}" font-size="12" font-family="${FONT}" fill="${TEXT_MUTED}">${esc(String(data[i][xKey] ?? ""))}</text>`;
    })
    .join("");

  // A single-series bar chart is a categorical comparison (SKUs, channels, days) rather than
  // a legend of series — color each bar by its own category, same treatment as the pie chart,
  // instead of every bar sharing one flat color.
  const perCategoryBars = chart.kind === "bar" && series.length === 1;

  const seriesMarkup = series
    .map((s, si) => {
      const color = seriesColor(si);
      const vals = data.map((row) => numAt(row, s.key));
      if (chart.kind === "bar") {
        const groupX0 = (i: number) => x(i) - groupWidth / 2 + si * (barW + 2);
        return vals
          .map((v, i) => {
            if (v == null) return "";
            const fill = perCategoryBars ? seriesColor(i) : color;
            return `<path d="${barPath(groupX0(i), Math.min(y(v), base), barW, Math.abs(base - y(v)))}" fill="${fill}" />`;
          })
          .join("");
      }
      if (chart.kind === "area") {
        return `<path d="${areaPath(vals, x, y, base)}" fill="${color}" fill-opacity="0.12" stroke="none" />
          <path d="${linePath(vals, x, y)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
      }
      const lastIdx = vals.reduce<number | null>((acc, v, i) => (v != null ? i : acc), null);
      const dot =
        lastIdx != null
          ? `<circle cx="${x(lastIdx)}" cy="${y(vals[lastIdx] as number)}" r="4" fill="${color}" stroke="${SURFACE}" stroke-width="2" />`
          : "";
      return `<path d="${linePath(vals, x, y)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />${dot}`;
    })
    .join("");

  const yAxisLabel = yLabel
    ? `<text x="${-(CH / 2)}" y="12" transform="rotate(-90)" text-anchor="middle" font-size="12" font-family="${FONT}" fill="${TEXT_MUTED}">${esc(yLabel)}</text>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
    <rect x="0" y="0" width="${W}" height="${height}" fill="${SURFACE}" />
    <title>${esc(title)}</title>
    ${gridLines}
    ${xLabels}
    ${seriesMarkup}
    ${yAxisLabel}
    ${legendMarkup(legend, CH + 8, M.left)}
  </svg>`;

  return { svg, width: W, height, legend };
}

const PIE_SIZE = 200; // circle's own bounding box
const PIE_CANVAS_W = 340; // wider than the circle so legend labels have room not to clip
const PIE_MAX_SLICES = 8;

function renderPie(chart: ChartSpec, title: string): RenderedSvg {
  const { data, series, xKey, unit } = chart;
  const key = series[0]?.key;
  const cx = PIE_CANVAS_W / 2;
  const cy = PIE_SIZE / 2;
  const r = PIE_SIZE * 0.34;

  if (!key) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${PIE_CANVAS_W}" height="${PIE_SIZE}"></svg>`,
      width: PIE_CANVAS_W,
      height: PIE_SIZE,
      legend: [],
    };
  }

  let rows = data.map((row) => ({ label: String(row[xKey] ?? ""), value: numAt(row, key) ?? 0 })).filter((r) => r.value > 0);
  let hasOther = false;
  if (rows.length > PIE_MAX_SLICES) {
    const head = rows.slice(0, PIE_MAX_SLICES - 1);
    const other = rows.slice(PIE_MAX_SLICES - 1).reduce((sum, r) => sum + r.value, 0);
    rows = [...head, { label: "Other", value: other }];
    hasOther = true;
  }
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const legend = rows.map((row, i) => ({
    color: hasOther && i === rows.length - 1 ? OTHER_COLOR : seriesColor(i),
    label: total ? `${row.label} · ${Math.round((row.value / total) * 100)}% (${formatChartValue(row.value, unit)})` : row.label,
  }));
  const height = PIE_SIZE + legend.length * LEGEND_ROW_H + 8;

  if (!total) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${PIE_CANVAS_W}" height="${height}"></svg>`,
      width: PIE_CANVAS_W,
      height,
      legend: [],
    };
  }

  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const slices = rows
    .map((row, i) => {
      const isOther = hasOther && i === rows.length - 1;
      const frac = row.value / total;
      const dash = frac * circumference;
      const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${isOther ? OTHER_COLOR : seriesColor(i)}" stroke-width="${r * 0.5}" stroke-dasharray="${Math.max(dash - 2, 0)} ${circumference - dash + 2}" stroke-dashoffset="${-offset}" />`;
      offset += dash;
      return el;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIE_CANVAS_W}" height="${height}" viewBox="0 0 ${PIE_CANVAS_W} ${height}">
    <rect x="0" y="0" width="${PIE_CANVAS_W}" height="${height}" fill="${SURFACE}" />
    <title>${esc(title)}</title>
    <g transform="rotate(-90 ${cx} ${cy})">${slices}</g>
    ${legendMarkup(legend, PIE_SIZE + 4, 8)}
  </svg>`;

  return { svg, width: PIE_CANVAS_W, height, legend };
}

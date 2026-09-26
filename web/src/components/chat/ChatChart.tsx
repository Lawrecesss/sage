"use client";

// Renders a chat/report ChartSpec (line/area/bar/pie) — the agent's ```chart fences, parsed
// by chart-blocks.ts. Same inline-SVG, CSS-variable approach as components/charts/*, just
// generalized to N series and a category axis instead of one fixed metric shape.

import { useWidth } from "@/components/charts/BarChart";
import { legendStyle, Swatch } from "@/components/charts/legend";
import { formatAxis } from "@/lib/format";
import type { ChartSpec, DataRow } from "@/lib/types";

// Fixed hue order, slots 1–8 — the validated default categorical palette (see the dataviz
// skill's palette.md). Never cycle or generate a 9th; extra categories fold into "Other".
const SERIES_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];
const OTHER_VAR = "var(--series-neutral)";

function seriesColor(i: number): string {
  return SERIES_VARS[i] ?? OTHER_VAR;
}

const compact = new Intl.NumberFormat("en-SG", { notation: "compact", maximumFractionDigits: 1 });

/** ChartSpec.unit is a free label (e.g. "SGD", "pct", "days") set by the agent, not the
 * app's MetricUnit enum — lib/format.ts's formatters don't apply here. */
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

/** Evenly-spaced tick indices, capped at `max` — avoids overlapping labels on up to 500 rows.
 * Also caps the count itself so small `n` never forces two adjacent indices together (e.g. 6
 * picks out of 8 rounds two pairs to neighbors) — keeps at least one skipped point of gap. */
function tickIndices(n: number, max: number): number[] {
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const spaced = Math.floor((n - 1) / 2) + 1;
  const count = Math.max(2, Math.min(max, spaced));
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

const DEFAULT_W = 560;
const H = 230;
const M = { top: 14, right: 14, bottom: 30, left: 64 };
const R = 4; // rounded bar data-end, per the mark spec

function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0 || w <= 0) return "";
  const r = Math.min(R, h, w / 2);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** M/L segments broken at nulls, so a gap in the data reads as a gap, not an interpolation. */
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

/** Fill under each contiguous non-null run of a line, closed back along the baseline. */
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

export function ChatChart({ chart, title }: { chart: ChartSpec; title: string }) {
  if (chart.kind === "pie") return <PieChart chart={chart} title={title} />;
  return <CartesianChart chart={chart} title={title} />;
}

function CartesianChart({ chart, title }: { chart: ChartSpec; title: string }) {
  const [ref, W] = useWidth<HTMLDivElement>(DEFAULT_W);
  const { data, series, xKey, unit, yLabel } = chart;
  const n = data.length;
  if (!n || !series.length) return null;

  const values = series.flatMap((s) => data.map((row) => numAt(row, s.key)).filter((v): v is number => v != null));
  const dataMax = Math.max(0, ...values);
  const dataMin = Math.min(0, ...values);
  const pad = (dataMax - dataMin) * 0.1 || Math.abs(dataMax) * 0.1 || 1;
  const max = dataMax + pad;
  const min = dataMin - (dataMin < 0 ? pad : 0);

  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (i: number) =>
    chart.kind === "bar" ? M.left + (iw / n) * (i + 0.5) : M.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => M.top + (1 - (v - min) / (max - min)) * ih;
  const base = y(Math.max(min, Math.min(0, max)));

  const yTicks = [0, 0.5, 1].map((t) => min + t * (max - min));
  const xTicks = tickIndices(n, chart.kind === "bar" ? Math.min(n, 10) : 6);

  const slot = iw / n;
  const groupWidth = Math.min(slot * 0.72, 40);
  const barW = chart.kind === "bar" ? Math.max(2, groupWidth / series.length - 2) : 0;

  return (
    <figure style={{ margin: 0 }}>
      <div ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label={title} style={{ display: "block", overflow: "visible" }}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text
              x={M.left - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              fontSize={12}
              fontFamily="var(--font-sans)"
              fill="var(--text-muted)"
            >
              {formatChartValue(t, unit)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor={chart.kind === "bar" ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            fontSize={12}
            fontFamily="var(--font-sans)"
            fill="var(--text-muted)"
          >
            {String(data[i][xKey] ?? "")}
          </text>
        ))}
        {series.map((s, si) => {
          const color = seriesColor(si);
          const vals = data.map((row) => numAt(row, s.key));
          if (chart.kind === "bar") {
            const groupX0 = (i: number) => x(i) - groupWidth / 2 + si * (barW + 2);
            return (
              <g key={s.key}>
                {vals.map((v, i) =>
                  v == null ? null : (
                    <path key={i} d={barPath(groupX0(i), Math.min(y(v), base), barW, Math.abs(base - y(v)))} fill={color}>
                      <title>{`${data[i][xKey]} · ${s.label}: ${formatChartValue(v, unit)}`}</title>
                    </path>
                  ),
                )}
              </g>
            );
          }
          if (chart.kind === "area") {
            return (
              <g key={s.key}>
                <path d={areaPath(vals, x, y, base)} fill={color} opacity={0.1} stroke="none" />
                <path d={linePath(vals, x, y)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          }
          const lastIdx = vals.reduce<number | null>((acc, v, i) => (v != null ? i : acc), null);
          return (
            <g key={s.key}>
              <path d={linePath(vals, x, y)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {lastIdx != null && (
                <circle cx={x(lastIdx)} cy={y(vals[lastIdx] as number)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2}>
                  <title>{`${data[lastIdx][xKey]} · ${s.label}: ${formatChartValue(vals[lastIdx] as number, unit)}`}</title>
                </circle>
              )}
            </g>
          );
        })}
        {yLabel && (
          <text
            x={-(H / 2)}
            y={12}
            transform="rotate(-90)"
            textAnchor="middle"
            fontSize={12}
            fontFamily="var(--font-sans)"
            fill="var(--text-muted)"
          >
            {yLabel}
          </text>
        )}
      </svg>
      </div>
      {series.length > 1 && (
        <figcaption style={legendStyle}>
          {series.map((s, i) => (
            <Swatch key={s.key} color={seriesColor(i)} label={s.label} />
          ))}
        </figcaption>
      )}
    </figure>
  );
}

const PIE_MAX_SLICES = SERIES_VARS.length; // beyond this, the tail folds into one "Other" slice

function PieChart({ chart, title }: { chart: ChartSpec; title: string }) {
  const { data, series, xKey, unit } = chart;
  const key = series[0]?.key;
  if (!key) return null;

  let rows = data.map((row) => ({ label: String(row[xKey] ?? ""), value: numAt(row, key) ?? 0 })).filter((r) => r.value > 0);
  let hasOther = false;
  if (rows.length > PIE_MAX_SLICES) {
    const head = rows.slice(0, PIE_MAX_SLICES - 1);
    const other = rows.slice(PIE_MAX_SLICES - 1).reduce((sum, r) => sum + r.value, 0);
    rows = [...head, { label: "Other", value: other }];
    hasOther = true;
  }
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (!total) return null;

  const cx = 90;
  const cy = 90;
  const r = 68;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox="0 0 180 180" width={180} height={180} role="img" aria-label={title}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {rows.map((row, i) => {
            const isOther = hasOther && i === rows.length - 1;
            const frac = row.value / total;
            const dash = frac * circumference;
            const el = (
              <circle
                key={row.label}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={isOther ? OTHER_VAR : seriesColor(i)}
                strokeWidth={34}
                strokeDasharray={`${Math.max(dash - 2, 0)} ${circumference - dash + 2}`}
                strokeDashoffset={-offset}
              >
                <title>{`${row.label}: ${formatChartValue(row.value, unit)} (${Math.round(frac * 100)}%)`}</title>
              </circle>
            );
            offset += dash;
            return el;
          })}
        </g>
      </svg>
      <figcaption style={legendStyle}>
        {rows.map((row, i) => {
          const isOther = hasOther && i === rows.length - 1;
          return (
            <Swatch
              key={row.label}
              color={isOther ? OTHER_VAR : seriesColor(i)}
              label={`${row.label} · ${Math.round((row.value / total) * 100)}%`}
            />
          );
        })}
      </figcaption>
    </figure>
  );
}

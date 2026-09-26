// Observed vs expected. Enough for detail pages; swap for a charting library only if
// we need zoom, brushing or many series.

import { formatMetricValue } from "@/lib/format";
import { legendStyle, Swatch } from "./legend";
import type { MetricUnit, SeriesPoint } from "@/lib/types";

const W = 720;
const H = 220;
const M = { top: 14, right: 14, bottom: 26, left: 62 };

export function LineChart({ points, unit, label }: { points: SeriesPoint[]; unit: MetricUnit; label: string }) {
  if (points.length < 2) return null;

  const all = points.flatMap((p) => (p.expected == null ? [p.value] : [p.value, p.expected]));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
  const min = lo - pad;
  const max = hi + pad;

  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (i: number) => M.left + (i / (points.length - 1)) * iw;
  const y = (v: number) => M.top + (1 - (v - min) / (max - min)) * ih;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const ticks = [0, 0.5, 1].map((t) => min + t * (max - min));
  const last = points.length - 1;
  const hasExpected = points.every((p) => p.expected != null);

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: "block" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fontFamily="var(--font-sans)" fill="var(--text-muted)">
              {formatMetricValue(t, unit)}
            </text>
          </g>
        ))}
        {[0, last].map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={i ? "end" : "start"}
            fontSize={12}
            fontFamily="var(--font-sans)"
            fill="var(--text-muted)"
          >
            {points[i].period}
          </text>
        ))}
        {hasExpected && (
          <path
            d={path(points.map((p) => p.expected as number))}
            fill="none"
            stroke="var(--series-neutral)"
            strokeDasharray="3 4"
            strokeWidth={1.5}
          />
        )}
        <path d={path(points.map((p) => p.value))} fill="none" stroke="var(--series-1)" strokeWidth={2} />
        <circle cx={x(last)} cy={y(points[last].value)} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2}>
          <title>{`${points[last].period}: ${formatMetricValue(points[last].value, unit)}`}</title>
        </circle>
      </svg>
      <figcaption style={legendStyle}>
        <Swatch color="var(--series-1)" label="Observed" />
        {hasExpected && <Swatch color="var(--series-neutral)" label="Expected" dashed />}
      </figcaption>
    </figure>
  );
}

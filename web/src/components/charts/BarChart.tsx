"use client";

// Grouped vertical bars. The chart measures its container so it renders at 1:1 pixel size —
// axis labels stay 12px at any width instead of scaling with a viewBox. Hovering (or
// focusing) a day shows a tooltip with every series' value.

import { useEffect, useRef, useState } from "react";
import { formatAxis, formatMetricValue } from "@/lib/format";
import type { MetricUnit } from "@/lib/types";
import { Swatch } from "./legend";
import styles from "./charts.module.css";

export interface BarDatum {
  label: string;
  value: number;
  compare?: number;
}

const H = 260;
const M = { top: 12, right: 8, bottom: 28, left: 56 };
const R = 4; // rounded data-end
const SERIES = ["var(--series-1)", "var(--series-2)"];

/** Bar as a path so only the top corners round, anchored flat on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0 || w <= 0) return "";
  const r = Math.min(R, h, w / 2);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** A "nice" axis maximum (1, 2, 2.5, 5 × 10ⁿ) so gridlines land on round values. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const f = v / 10 ** exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function BarChart({
  data,
  unit,
  seriesLabels = ["Actual", "Comparison"],
  title,
}: {
  data: BarDatum[];
  /** Unit of the values: axis ticks use the short form, the tooltip the full one. */
  unit: MetricUnit;
  seriesLabels?: [string, string] | string[];
  title: string;
}) {
  const format = (v: number) => formatAxis(v, unit);
  const formatValue = (v: number) => formatMetricValue(v, unit);
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const max = niceMax(Math.max(...data.flatMap((d) => [d.value, d.compare ?? 0])) * 1.05);
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const slot = iw / data.length;
  const grouped = data.some((d) => d.compare != null);
  const groupW = Math.min(slot * 0.64, 72);
  const bw = grouped ? groupW / 2 - 2 : Math.min(slot * 0.5, 44);
  const y = (v: number) => M.top + (1 - v / max) * ih;
  const base = M.top + ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const hovered = hover != null ? data[hover] : null;
  const tipLeft = hover != null ? M.left + hover * slot + slot / 2 : 0;

  return (
    <figure className={styles.figure}>
      {grouped && (
        <figcaption className={styles.legend}>
          <Swatch color={SERIES[0]} label={seriesLabels[0]} />
          <Swatch color={SERIES[1]} label={seriesLabels[1]} />
        </figcaption>
      )}
      <div ref={ref} className={styles.plot} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} role="img" aria-label={title} style={{ display: "block" }}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y(max * t)}
                y2={y(max * t)}
                stroke={t === 0 ? "var(--border-strong)" : "var(--grid)"}
              />
              <text x={M.left - 10} y={y(max * t)} dy="0.32em" textAnchor="end" className={styles.axis}>
                {format(max * t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = M.left + i * slot + slot / 2;
            const dim = hover != null && hover !== i;
            return (
              <g
                key={d.label}
                tabIndex={0}
                role="button"
                aria-label={`${d.label}: ${seriesLabels[0]} ${formatValue(d.value)}${d.compare != null ? `, ${seriesLabels[1]} ${formatValue(d.compare)}` : ""}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className={styles.slot}
              >
                <rect x={M.left + i * slot} y={M.top} width={slot} height={ih} fill={hover === i ? "var(--surface-muted)" : "transparent"} rx={6} />
                <path
                  d={barPath(grouped ? x0 - bw - 2 : x0 - bw / 2, y(d.value), bw, base - y(d.value))}
                  fill={SERIES[0]}
                  opacity={dim ? 0.45 : 1}
                />
                {d.compare != null && (
                  <path d={barPath(x0 + 2, y(d.compare), bw, base - y(d.compare))} fill={SERIES[1]} opacity={dim ? 0.45 : 1} />
                )}
                <text x={x0} y={H - 8} textAnchor="middle" className={hover === i ? styles.axisActive : styles.axis}>
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div
            className={styles.tooltip}
            style={{
              left: Math.min(Math.max(tipLeft, 90), W - 90),
              top: Math.max(y(Math.max(hovered.value, hovered.compare ?? 0)) - 12, 0),
            }}
            role="status"
          >
            <div className={styles.tooltipTitle}>{hovered.label}</div>
            <TooltipRow color={SERIES[0]} label={seriesLabels[0]} value={formatValue(hovered.value)} />
            {hovered.compare != null && <TooltipRow color={SERIES[1]} label={seriesLabels[1]} value={formatValue(hovered.compare)} />}
          </div>
        )}
      </div>
    </figure>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className={styles.tooltipRow}>
      <span className={styles.swatch} style={{ background: color }} aria-hidden />
      <span className={styles.tooltipLabel}>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}


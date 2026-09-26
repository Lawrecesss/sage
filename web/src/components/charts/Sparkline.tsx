// Inline SVG sparkline. Tinted by what the trend means (see changeTone), not by series:
// good = positive, bad = negative, neutral = muted. A soft area fill gives it weight.

import type { Tone } from "@/lib/format";

const TONE_COLOR: Record<Tone, string> = {
  good: "var(--positive)",
  bad: "var(--negative)",
  neutral: "var(--text-faint)",
};

export function Sparkline({
  values,
  width = 120,
  height = 32,
  label,
  color,
  tone = "neutral",
}: {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
  color?: string;
  tone?: Tone;
}) {
  if (values.length < 2) return null;
  const stroke = color ?? TONE_COLOR[tone];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => (i / (values.length - 1)) * (width - pad) + pad / 2;
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(values.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  const last = values[values.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ overflow: "visible", display: "block" }}
    >
      <path d={area} fill={stroke} opacity={0.1} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.75} fill={stroke} />
    </svg>
  );
}

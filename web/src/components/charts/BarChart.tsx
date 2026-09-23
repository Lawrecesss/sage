// Grouped vertical bars. The UI is monochrome; charts carry the colour, from the
// validated categorical slots in globals.css, assigned in fixed order.

export interface BarDatum {
  label: string;
  value: number;
  compare?: number;
}

// Kept close to the rendered pixel size so labels stay legible when the card is narrow.
const W = 400;
const H = 190;
const M = { top: 12, right: 6, bottom: 26, left: 48 };
const R = 3; // rounded data-end

/** Bar as a path so only the top corners round, anchored flat on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(R, h, w / 2);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

export function BarChart({
  data,
  format,
  seriesLabels = ["Actual", "Comparison"],
  title,
}: {
  data: BarDatum[];
  format: (v: number) => string;
  seriesLabels?: [string, string] | string[];
  title: string;
}) {
  const max = Math.max(...data.flatMap((d) => [d.value, d.compare ?? 0])) * 1.1 || 1;
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const slot = iw / data.length;
  const grouped = data.some((d) => d.compare != null);
  const bw = grouped ? (slot * 0.62) / 2 - 1 : slot * 0.5;
  const y = (v: number) => M.top + (1 - v / max) * ih;
  const base = M.top + ih;

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title} style={{ display: "block" }}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(max * t)} y2={y(max * t)} stroke="var(--grid)" />
            <text
              x={M.left - 7}
              y={y(max * t)}
              dy="0.32em"
              textAnchor="end"
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill="var(--text-faint)"
            >
              {format(max * t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = M.left + i * slot + slot / 2;
          return (
            <g key={d.label}>
              <path
                d={barPath(grouped ? x0 - bw - 1 : x0 - bw / 2, y(d.value), bw, base - y(d.value))}
                fill="var(--series-1)"
              >
                <title>{`${d.label} · ${seriesLabels[0]}: ${format(d.value)}`}</title>
              </path>
              {d.compare != null && (
                <path d={barPath(x0 + 1, y(d.compare), bw, base - y(d.compare))} fill="var(--series-2)">
                  <title>{`${d.label} · ${seriesLabels[1]}: ${format(d.compare)}`}</title>
                </path>
              )}
              <text x={x0} y={H - 7} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill="var(--text-faint)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {grouped && (
        <figcaption style={legendStyle}>
          <Swatch color="var(--series-1)" label={seriesLabels[0]} />
          <Swatch color="var(--series-2)" label={seriesLabels[1]} />
        </figcaption>
      )}
    </figure>
  );
}

export const legendStyle: React.CSSProperties = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginTop: 10,
};

/** Legend entry: coloured mark, text in ink — never coloured text. */
export function Swatch({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={
          dashed
            ? { width: 12, height: 0, borderTop: `2px dashed ${color}`, display: "inline-block" }
            : { width: 10, height: 10, background: color, borderRadius: 2, display: "inline-block" }
        }
        aria-hidden
      />
      {label}
    </span>
  );
}

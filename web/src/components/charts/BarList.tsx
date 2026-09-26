// Horizontal ranked bars — the stand-in for a pie/donut. One measure, so one hue: every row
// is the same categorical slot, with the value right-aligned in tabular numerals.

import styles from "./charts.module.css";

export function BarList({
  rows,
  format,
  share,
}: {
  rows: { label: string; value: number }[];
  format: (v: number) => string;
  /** Also show each row's share of the total (for absolute amounts). */
  share?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <ul className={styles.barList}>
      {rows.map((r) => (
        <li key={r.label} className={styles.barRow} title={`${r.label}: ${format(r.value)}`}>
          <span className={styles.barLabel}>{r.label}</span>
          <span className={styles.barValue}>
            {share && <span className={styles.barShare}>{Math.round((r.value / total) * 100)}%</span>}
            <span className="num">{format(r.value)}</span>
          </span>
          <span className={styles.barTrack} aria-hidden>
            <span className={styles.barFill} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

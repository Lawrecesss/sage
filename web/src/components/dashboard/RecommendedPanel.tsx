// Recommended lives inside the dashboard, collapsed to a one-line preview.
// <details> keeps the expand working without client JavaScript.

import Link from "next/link";
import { legendStyle, Swatch } from "@/components/charts/BarChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { Delta, DomainMark } from "@/components/ui";
import { changeTone, formatChange, formatDateTime, formatMetricValue } from "@/lib/format";
import type { RecommendedMetric } from "@/lib/types";
import styles from "./dashboard.module.css";

export function RecommendedPanel({
  metrics,
  frequency,
  updatedAt,
  defaultOpen = false,
}: {
  metrics: RecommendedMetric[];
  frequency: { week: string; counts: Record<string, number> }[];
  updatedAt: string;
  defaultOpen?: boolean;
}) {
  const pinned = metrics.filter((m) => m.pinned);
  const suggested = metrics.filter((m) => !m.pinned);

  return (
    <details className={styles.recommended} open={defaultOpen}>
      <summary className={styles.recSummary}>
        <svg className={styles.chevron} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className={styles.recTitle}>Recommended for you</span>
        <span className={styles.recMeta}>{metrics.length} metrics</span>

        {/* Preview: names and current values only. The detail is behind the expand. */}
        <span className={styles.preview}>
          {metrics.slice(0, 5).map((m) => (
            <span key={m.metric_id} className={styles.previewChip}>
              <DomainMark domain={m.domain} />
              {m.label}
              <span className={`${styles.previewValue} num`}>{formatMetricValue(m.value, m.unit)}</span>
            </span>
          ))}
        </span>

        <span className={styles.expandHint}>
          <span className={styles.whenClosed}>Expand</span>
          <span className={styles.whenOpen}>Collapse</span>
        </span>
      </summary>

      <div className={styles.recBody}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
          Ranked by how often you ask about them. Affinity model updated {formatDateTime(updatedAt)}.
        </p>

        {pinned.length > 0 && (
          <div>
            <h3 className={styles.subhead}>Pinned · {pinned.length}</h3>
            <div className={styles.recGrid}>
              {pinned.map((m) => (
                <Tile key={m.metric_id} metric={m} />
              ))}
            </div>
          </div>
        )}

        {suggested.length > 0 && (
          <div>
            <h3 className={styles.subhead}>Suggested · {suggested.length}</h3>
            <div className={styles.recGrid}>
              {suggested.map((m) => (
                <Tile key={m.metric_id} metric={m} />
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className={styles.subhead}>Questions asked · last 6 weeks</h3>
          <QueryFrequency frequency={frequency} metrics={metrics} />
        </div>
      </div>
    </details>
  );
}

function Tile({ metric: m }: { metric: RecommendedMetric }) {
  const tone = changeTone(m.value, m.previous, m.direction);
  return (
    <Link href={`/metrics/${m.metric_id}`} className={m.pinned ? styles.tilePinned : styles.tile}>
      <div className={styles.tileTop}>
        <span className={styles.tileLabel}>
          <DomainMark domain={m.domain} /> {m.label}
        </span>
        <span className={styles.queryCount}>{m.query_count} asks</span>
      </div>
      <div className={styles.tileTop}>
        <span>
          <div className={`${styles.tileValue} num`}>{formatMetricValue(m.value, m.unit)}</div>
          <Delta tone={tone}>
            {tone === "neutral" ? "" : m.value > m.previous ? "▲" : "▼"}
            {formatChange(m.value, m.previous, m.unit)}
          </Delta>
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          <Sparkline values={m.spark} width={88} height={28} />
        </span>
      </div>
      <p className={styles.tileReason}>{m.reason}</p>
      <div className={styles.tags}>
        {m.tags.map((t) => (
          <span key={t} className={styles.tag}>
            {t}
          </span>
        ))}
      </div>
    </Link>
  );
}

/** Stacked columns: one column per week, one segment per metric, totals labelled. */
function QueryFrequency({
  frequency,
  metrics,
}: {
  frequency: { week: string; counts: Record<string, number> }[];
  metrics: RecommendedMetric[];
}) {
  const ids = Object.keys(frequency[0]?.counts ?? {});
  const labelFor = (id: string) => metrics.find((m) => m.metric_id === id)?.label ?? id;
  const totals = frequency.map((f) => ids.reduce((sum, id) => sum + (f.counts[id] ?? 0), 0));
  const max = Math.max(...totals) || 1;
  const colors = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>
        {frequency.map((f, i) => (
          <div key={f.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <span className="num" style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {totals[i]}
            </span>
            <div
              style={{
                width: "100%",
                maxWidth: 46,
                height: `${(totals[i] / max) * 78}px`,
                display: "flex",
                flexDirection: "column-reverse",
                gap: 2, // surface gap between stacked segments
              }}
            >
              {ids.map((id, j) => (
                <div
                  key={id}
                  title={`${labelFor(id)} · ${f.week}: ${f.counts[id] ?? 0}`}
                  style={{
                    height: `${((f.counts[id] ?? 0) / totals[i]) * 100}%`,
                    background: colors[j % colors.length],
                    borderRadius: j === ids.length - 1 ? "2px 2px 0 0" : 0,
                  }}
                />
              ))}
            </div>
            <span className="label" style={{ fontSize: 9 }}>
              {f.week}
            </span>
          </div>
        ))}
      </div>
      <div style={legendStyle}>
        {ids.map((id, j) => (
          <Swatch key={id} color={colors[j % colors.length]} label={labelFor(id)} />
        ))}
      </div>
    </div>
  );
}

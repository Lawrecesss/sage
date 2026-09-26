// Recommended lives inside the dashboard. Collapsed, it is a horizontally scrollable row of
// compact metric cards; expanding reveals pinned and suggested tiles, why each is suggested,
// and the six-week question-frequency chart. The expand is a <details> element, so it works
// without client JavaScript; `/dashboard?rec=open` deep-links to the expanded state.

import { ChevronDown, Pin, Sparkles } from "lucide-react";
import Link from "next/link";
import { legendStyle, Swatch } from "@/components/charts/legend";
import { Sparkline } from "@/components/charts/Sparkline";
import { DeltaPill, DomainMark } from "@/components/ui";
import { changeTone, formatChange, formatDateTime, formatMetricValue } from "@/lib/format";
import type { RecommendedMetric } from "@/lib/types";
import styles from "./dashboard.module.css";

const directionOf = (m: RecommendedMetric) => (m.value > m.previous ? "up" : m.value < m.previous ? "down" : "flat");

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
    <section className={styles.recommended} aria-labelledby="rec-title">
      <div className={styles.recHead}>
        <span className={styles.recIcon} aria-hidden>
          <Sparkles size={16} strokeWidth={1.75} />
        </span>
        <div>
          <h2 id="rec-title" className={styles.recTitle}>
            Recommended for you
          </h2>
          <p className={styles.recMeta}>{metrics.length} metrics, ranked by how often you ask about them</p>
        </div>
      </div>

      {/* Collapsed view: compact cards, one scrollable row. */}
      <ul className={styles.strip}>
        {metrics.map((m) => {
          const tone = changeTone(m.value, m.previous, m.direction);
          return (
            <li key={m.metric_id}>
              <Link href={`/metrics/${m.metric_id}`} className={styles.stripCard}>
                <span className={styles.stripLabel}>
                  <DomainMark domain={m.domain} size={14} />
                  <span>{m.label}</span>
                  {m.pinned && <Pin size={12} strokeWidth={2} aria-label="Pinned" className={styles.pinIcon} />}
                </span>
                <span className={`${styles.stripValue} num`}>{formatMetricValue(m.value, m.unit)}</span>
                <DeltaPill tone={tone} direction={directionOf(m)}>
                  {formatChange(m.value, m.previous, m.unit)}
                </DeltaPill>
              </Link>
            </li>
          );
        })}
      </ul>

      <details className={styles.recDetails} open={defaultOpen}>
        <summary className={styles.recSummary}>
          <ChevronDown className={styles.chevron} size={16} strokeWidth={2} aria-hidden />
          <span className={styles.whenClosed}>Show details and why they&apos;re suggested</span>
          <span className={styles.whenOpen}>Hide details</span>
        </summary>

        <div className={styles.recBody}>
          <p className={styles.recNote}>Affinity model updated {formatDateTime(updatedAt)}.</p>

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
    </section>
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
        <span className={styles.tileNumbers}>
          <span className={`${styles.tileValue} num`}>{formatMetricValue(m.value, m.unit)}</span>
          <DeltaPill tone={tone} direction={directionOf(m)}>
            {formatChange(m.value, m.previous, m.unit)}
          </DeltaPill>
        </span>
        <Sparkline values={m.spark} width={96} height={32} tone={tone} />
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
  const colors = ["var(--series-1)", "var(--series-3)", "var(--series-4)"];

  return (
    <div>
      <div className={styles.freq}>
        {frequency.map((f, i) => (
          <div key={f.week} className={styles.freqCol}>
            <span className={`${styles.freqTotal} num`}>{totals[i]}</span>
            <div className={styles.freqBar} style={{ height: `${(totals[i] / max) * 96}px` }}>
              {ids.map((id, j) => (
                <div
                  key={id}
                  title={`${labelFor(id)} · ${f.week}: ${f.counts[id] ?? 0}`}
                  style={{
                    height: `${((f.counts[id] ?? 0) / totals[i]) * 100}%`,
                    background: colors[j % colors.length],
                    borderRadius: j === ids.length - 1 ? "4px 4px 0 0" : 0,
                  }}
                />
              ))}
            </div>
            <span className={styles.freqWeek}>{f.week}</span>
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

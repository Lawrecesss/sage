import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { DomainTag, SeverityDot, StatusBadge } from "@/components/ui";
import {
  changeTone,
  formatDeviation,
  formatDimensions,
  formatImpact,
  formatMetricValue,
  formatScore,
} from "@/lib/format";
import type { Metric, Severity, Signal } from "@/lib/types";
import styles from "./signals.module.css";

/** Signals carry an anomaly score, not a severity; the dot buckets the score the same way briefs rank. */
function severityOf(score: number): Severity {
  return score >= 0.8 ? "high" : score >= 0.6 ? "medium" : "low";
}

const TONE_CLASS = { good: styles.good, bad: styles.bad, neutral: styles.neutral };

/**
 * Rows keep the caller's order (the dashboard passes them impact-sorted). Every row links to
 * the signal's explain view; the whole row is the hit target. Below 768px it renders as cards.
 */
export function SignalTable({ signals, metrics }: { signals: Signal[]; metrics: Map<string, Metric> }) {
  const rows = signals.map((s) => {
    const metric = metrics.get(s.metric_id);
    const unit = metric?.unit ?? "units";
    return {
      s,
      metric,
      unit,
      label: metric?.label ?? s.metric_id,
      severity: severityOf(s.score),
      devTone: TONE_CLASS[changeTone(s.observed, s.expected, metric?.direction ?? "context_dependent")],
    };
  });

  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Signal</th>
              <th>Domain</th>
              <th className={styles.right}>Observed</th>
              <th className={styles.right}>Expected</th>
              <th className={styles.right}>Deviation</th>
              <th className={styles.right}>Impact</th>
              <th>
                <span title="Anomaly score, 0–1: how unusual the move is">Score</span>
              </th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, metric, unit, label, severity, devTone }) => (
              <tr key={s.signal_id} className={styles.row}>
                <td>
                  <div className={styles.signalCell}>
                    <SeverityDot severity={severity} />
                    <div className={styles.signalText}>
                      <Link href={`/signals/${s.signal_id}`} className={styles.rowLink}>
                        {label}
                      </Link>
                      <span className={styles.sub}>
                        <span className="mono">{s.signal_id}</span> · {formatDimensions(s.dimensions)} · {s.period}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <DomainTag domain={metric?.owner_domain} />
                </td>
                <td className={`${styles.right} num`}>{formatMetricValue(s.observed, unit)}</td>
                <td className={`${styles.right} num ${styles.muted}`}>{formatMetricValue(s.expected, unit)}</td>
                <td className={`${styles.right} num ${devTone}`}>{formatDeviation(s.deviation)}</td>
                <td className={`${styles.right} num ${styles.impact}`}>{formatImpact(s.dollar_impact_est)}</td>
                <td>
                  <Score score={s.score} />
                </td>
                <td>
                  <span className={styles.statusCell}>
                    <StatusBadge status={s.status} />
                    <ChevronRight size={16} strokeWidth={1.75} aria-hidden className={styles.chevron} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={styles.cards}>
        {rows.map(({ s, metric, unit, label, severity, devTone }) => (
          <li key={s.signal_id}>
            <Link href={`/signals/${s.signal_id}`} className={styles.card}>
              <div className={styles.cardTop}>
                <div className={styles.signalCell}>
                  <SeverityDot severity={severity} />
                  <div className={styles.signalText}>
                    <span className={styles.cardTitle}>{label}</span>
                    <span className={styles.sub}>
                      <span className="mono">{s.signal_id}</span> · {s.period}
                    </span>
                  </div>
                </div>
                <span className={`${styles.cardImpact} num`}>{formatImpact(s.dollar_impact_est)}</span>
              </div>
              <dl className={styles.cardStats}>
                <div>
                  <dt>Observed</dt>
                  <dd className="num">{formatMetricValue(s.observed, unit)}</dd>
                </div>
                <div>
                  <dt>Expected</dt>
                  <dd className="num">{formatMetricValue(s.expected, unit)}</dd>
                </div>
                <div>
                  <dt>Deviation</dt>
                  <dd className={`num ${devTone}`}>{formatDeviation(s.deviation)}</dd>
                </div>
              </dl>
              <div className={styles.cardFoot}>
                <DomainTag domain={metric?.owner_domain} />
                <Score score={s.score} />
                <StatusBadge status={s.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Score({ score }: { score: number }) {
  return (
    <span className={styles.score} title="Anomaly score (0–1)">
      <span className={`${styles.scoreValue} num`}>{formatScore(score)}</span>
      <span className={styles.scoreBar} aria-hidden>
        <span className={styles.scoreFill} style={{ width: `${Math.round(score * 100)}%` }} />
      </span>
    </span>
  );
}

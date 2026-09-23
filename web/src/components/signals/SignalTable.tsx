import Link from "next/link";
import { DomainTag, StatusBadge } from "@/components/ui";
import { formatDeviation, formatDimensions, formatImpact, formatMetricValue } from "@/lib/format";
import type { Metric, Signal } from "@/lib/types";
import styles from "./signals.module.css";

export function SignalTable({ signals, metrics }: { signals: Signal[]; metrics: Map<string, Metric> }) {
  return (
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
            <th>Score</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => {
            const metric = metrics.get(s.metric_id);
            const unit = metric?.unit ?? "units";
            return (
              <tr key={s.signal_id}>
                <td>
                  <Link href={`/signals/${s.signal_id}`} className={styles.metricLink}>
                    {metric?.label ?? s.metric_id}
                  </Link>
                  <span className={styles.sub}>
                    {formatDimensions(s.dimensions)} · {s.period}
                  </span>
                </td>
                <td>
                  <DomainTag domain={metric?.owner_domain} />
                </td>
                <td className={`${styles.right} num`}>{formatMetricValue(s.observed, unit)}</td>
                <td className={`${styles.right} num`}>{formatMetricValue(s.expected, unit)}</td>
                <td className={`${styles.right} num`}>{formatDeviation(s.deviation)}</td>
                <td className={`${styles.right} num`} style={{ fontWeight: 600 }}>
                  {formatImpact(s.dollar_impact_est)}
                </td>
                <td>
                  <div className={styles.scoreBar} title={s.score.toFixed(2)}>
                    <div className={styles.scoreFill} style={{ width: `${s.score * 100}%` }} />
                  </div>
                </td>
                <td>
                  <StatusBadge status={s.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

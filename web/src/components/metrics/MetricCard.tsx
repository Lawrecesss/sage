import Link from "next/link";
import { Card } from "@/components/ui";
import { humanize } from "@/lib/format";
import type { Metric } from "@/lib/types";
import styles from "./metrics.module.css";

export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <Link href={`/metrics/${metric.id}`} className={styles.cardLink}>
      <Card>
        <div className={styles.label}>{metric.label}</div>
        <div className={styles.id}>{metric.id}</div>
        <p className={styles.desc}>{metric.description}</p>
        <div className={styles.tags}>
          <span className={styles.tag}>{metric.unit}</span>
          <span className={styles.tag}>{humanize(metric.direction)}</span>
          {metric.detectors.map((d) => (
            <span key={d} className={styles.tag}>
              {d}
            </span>
          ))}
        </div>
      </Card>
    </Link>
  );
}

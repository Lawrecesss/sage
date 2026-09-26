// The anomaly scan's findings for a saved report (lib/anomalies.ts), above the agent's prose.

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import styles from "@/components/reports/reports.module.css";
import { SeverityBadge } from "@/components/ui";
import { formatMoney, formatShortDate } from "@/lib/format";
import type { Anomaly, AnomalyItem } from "@/lib/types";

const KIND_LABEL: Record<Anomaly["kind"], string> = { divergence: "Divergence", surge: "Surge", drop: "Drop" };

function Item({ item }: { item: AnomalyItem }) {
  const up = item.current >= item.previous;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const change = item.change === null ? "new" : `${up ? "+" : ""}${Math.round(item.change * 100)}%`;
  return (
    <li className={styles.anomalyItem}>
      <Icon size={14} strokeWidth={2} className={up ? styles.up : styles.down} aria-label={up ? "up" : "down"} />
      <span className={styles.anomalyName}>{item.name}</span>
      <span className={styles.anomalyNums}>
        <span className="num">
          {formatMoney(item.previous)} → {formatMoney(item.current)}
        </span>
        <span className={`num ${up ? styles.up : styles.down}`}>{change}</span>
      </span>
    </li>
  );
}

export function AnomalyList({ anomalies }: { anomalies: Anomaly[] }) {
  if (anomalies.length === 0) return null;
  const { period, baseline } = anomalies[0];
  return (
    <section className={styles.anomalies} aria-labelledby="anomalies-title">
      <div className={styles.anomaliesHead}>
        <h3 id="anomalies-title" className={styles.anomaliesTitle}>
          Anomalies flagged
        </h3>
        <span className={styles.anomaliesMeta}>
          Gross revenue by SKU, {formatShortDate(period.start)}–{formatShortDate(period.end)} vs {formatShortDate(baseline.start)}–
          {formatShortDate(baseline.end)}
        </span>
      </div>
      <ul className={styles.anomalyRows}>
        {anomalies.map((a, i) => (
          <li key={i} className={styles.anomaly}>
            <div className={styles.anomalyTop}>
              <SeverityBadge severity={a.severity} />
              <span className={styles.anomalyKind}>{KIND_LABEL[a.kind]}</span>
            </div>
            <p className={styles.anomalySummary}>{a.summary}</p>
            <ul className={styles.anomalyItems}>
              {a.items.map((item) => (
                <Item key={item.sku} item={item} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

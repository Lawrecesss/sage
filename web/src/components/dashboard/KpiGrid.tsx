import Link from "next/link";
import { Sparkline } from "@/components/charts/Sparkline";
import { Delta } from "@/components/ui";
import { changeTone, formatChange, formatMetricValue } from "@/lib/format";
import type { Kpi } from "@/lib/types";
import styles from "./dashboard.module.css";

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className={styles.kpiGrid}>
      {kpis.map((k) => {
        const tone = changeTone(k.value, k.previous, k.direction);
        return (
          <Link key={k.metric_id} href={`/metrics/${k.metric_id}`} className={styles.kpiCell}>
            <div className={styles.kpiTop}>
              <span className="label">{k.label}</span>
              <span style={{ color: "var(--text-muted)" }}>
                <Sparkline values={k.spark} width={54} height={18} />
              </span>
            </div>
            <div>
              <div className={`${styles.kpiValue} num`}>{formatMetricValue(k.value, k.unit)}</div>
              <div className={styles.kpiFoot}>
                <Delta tone={tone}>
                  {tone === "neutral" ? "" : k.value > k.previous ? "▲" : "▼"}
                  {formatChange(k.value, k.previous, k.unit)}
                </Delta>
                {k.sub && <span className={styles.kpiSub}>{k.sub}</span>}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

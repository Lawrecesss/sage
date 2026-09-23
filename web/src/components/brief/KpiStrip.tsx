import Link from "next/link";
import { Sparkline } from "@/components/charts/Sparkline";
import { Delta } from "@/components/ui";
import { changeTone, formatChange, formatMetricValue } from "@/lib/format";
import type { Kpi } from "@/lib/types";
import styles from "./brief.module.css";

export function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className={styles.kpis}>
      {kpis.map((k) => {
        const tone = changeTone(k.value, k.previous, k.direction);
        return (
          <Link key={k.metric_id} href={`/metrics/${k.metric_id}`} className={styles.kpi}>
            <span className="label">{k.label}</span>
            <span className={`${styles.kpiValue} num`}>{formatMetricValue(k.value, k.unit)}</span>
            <span className={styles.kpiFoot}>
              <Delta tone={tone}>
                {tone === "neutral" ? "" : k.value > k.previous ? "▲" : "▼"}
                {formatChange(k.value, k.previous, k.unit)}
              </Delta>
              <span style={{ color: "var(--text-muted)" }}>
                <Sparkline values={k.spark} width={60} height={20} />
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

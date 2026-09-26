import Link from "next/link";
import { Sparkline } from "@/components/charts/Sparkline";
import { DeltaPill } from "@/components/ui";
import { changeTone, formatChange, formatMetricValue } from "@/lib/format";
import type { Kpi } from "@/lib/types";
import styles from "./dashboard.module.css";

/** One KPI: label, big value, delta pill coloured by meaning, and a sparkline in the same tone. */
export function KpiTile({ kpi: k, size = "lg", context = "vs prior period" }: { kpi: Kpi; size?: "lg" | "md"; context?: string }) {
  const tone = changeTone(k.value, k.previous, k.direction);
  const direction = k.value > k.previous ? "up" : k.value < k.previous ? "down" : "flat";
  return (
    <Link href={`/metrics/${k.metric_id}`} className={size === "lg" ? styles.kpi : styles.kpiMd}>
      <span className={styles.kpiLabel}>{k.label}</span>
      <span className={styles.kpiBody}>
        <span className={`${styles.kpiValue} num`}>{formatMetricValue(k.value, k.unit)}</span>
        <span className={styles.kpiSpark}>
          <Sparkline values={k.spark} width={size === "lg" ? 96 : 72} height={size === "lg" ? 36 : 28} tone={tone} />
        </span>
      </span>
      <span className={styles.kpiFoot}>
        <DeltaPill tone={tone} direction={direction} context={context}>
          {formatChange(k.value, k.previous, k.unit)}
        </DeltaPill>
      </span>
      {k.sub && <span className={styles.kpiSub}>{k.sub}</span>}
    </Link>
  );
}

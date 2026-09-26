import type { Kpi } from "@/lib/types";
import { KpiTile } from "./KpiTile";
import styles from "./dashboard.module.css";

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className={styles.kpiGrid}>
      {kpis.map((k) => (
        <KpiTile key={k.metric_id} kpi={k} />
      ))}
    </div>
  );
}

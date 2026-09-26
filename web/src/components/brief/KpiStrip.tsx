import { KpiTile } from "@/components/dashboard/KpiTile";
import type { Kpi } from "@/lib/types";
import styles from "./brief.module.css";

export function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className={styles.kpis}>
      {kpis.map((k) => (
        <KpiTile key={k.metric_id} kpi={k} size="md" />
      ))}
    </div>
  );
}

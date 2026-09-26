import dash from "@/components/dashboard/dashboard.module.css";
import shell from "@/components/shell/shell.module.css";
import { Skeleton } from "@/components/ui";

/** Mirrors the Dashboard layout: KPI grid, recommended strip, charts, signals table. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" style={{ display: "contents" }}>
      <div className={shell.topbar}>
        <div className={shell.topbarTitle}>
          <Skeleton width={132} height={24} />
        </div>
        <div className={shell.topbarControls}>
          <Skeleton width={290} height={36} radius={8} />
          <Skeleton width={210} height={36} radius={8} />
        </div>
        <div className={shell.topbarRight}>
          <Skeleton width={112} height={36} radius={8} />
        </div>
      </div>
      <div className={shell.page}>
        <div className={dash.kpiGrid}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={150} radius={12} />
          ))}
        </div>
        <div style={{ marginBottom: 24 }}>
          <Skeleton height={164} radius={12} />
        </div>
        <div className={dash.charts}>
          <div className={dash.chartWide}>
            <Skeleton height={360} radius={12} />
          </div>
          <Skeleton height={260} radius={12} />
          <Skeleton height={260} radius={12} />
        </div>
        <Skeleton height={320} radius={12} />
      </div>
    </div>
  );
}

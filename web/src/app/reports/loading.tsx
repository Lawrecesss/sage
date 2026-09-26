import styles from "@/components/reports/reports.module.css";
import shell from "@/components/shell/shell.module.css";
import { Skeleton } from "@/components/ui";

/** Mirrors the Reports layout — header, list pane, brief detail — so nothing jumps on load. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading reports" style={{ display: "contents" }}>
      <div className={shell.topbar}>
        <div className={shell.topbarTitle}>
          <Skeleton width={96} height={24} />
          <Skeleton width={180} height={14} />
        </div>
        <div className={shell.topbarRight}>
          <Skeleton width={132} height={36} radius={8} />
        </div>
      </div>
      <div className={styles.split}>
        <div className={styles.list}>
          <div className={styles.tools}>
            <Skeleton height={40} radius={8} />
            <Skeleton height={36} radius={8} />
          </div>
          <div className={styles.rows}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={styles.skRow}>
                <div className={styles.skRowTop}>
                  <Skeleton width={88} height={14} />
                  <Skeleton width={64} height={16} />
                </div>
                <Skeleton height={12} />
                <Skeleton width="70%" height={12} />
                <Skeleton width={72} height={10} />
              </div>
            ))}
          </div>
        </div>
        <div className={styles.detail}>
          <div className={styles.detailInner}>
            <Skeleton width={160} height={14} />
            <div style={{ height: 12 }} />
            <Skeleton width="80%" height={30} />
            <div style={{ height: 8 }} />
            <Skeleton width="55%" height={30} />
            <div style={{ height: 28 }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} height={128} radius={12} />
              ))}
            </div>
            <div style={{ height: 40 }} />
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <Skeleton height={240} radius={12} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

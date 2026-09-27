import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AnomalyList } from "@/components/anomalies/AnomalyList";
import styles from "@/components/anomalies/anomalies.module.css";
import { TopBar } from "@/components/shell/TopBar";
import shell from "@/components/shell/shell.module.css";
import { ButtonLink } from "@/components/ui";
import { listCurrentAnomalies, listReports } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { resolveTenantIdForPage } from "@/lib/tenant";

export const metadata: Metadata = { title: "Anomalies" };
export const dynamic = "force-dynamic";

/** How many recent report runs with anomalies to show under the current scan. */
const REPORT_RUNS = 5;

/** The current anomaly scan (last 7 days vs the 7 before), then what recent report runs flagged —
 * the same lib/anomalies.ts scan, saved with each report. */
export default async function AnomaliesPage() {
  const tenantId = await resolveTenantIdForPage();
  const [current, reports] = await Promise.all([listCurrentAnomalies(tenantId), listReports(tenantId, 30)]);
  const flagged = reports.filter((r) => r.anomalies.length > 0).slice(0, REPORT_RUNS);

  return (
    <>
      <TopBar
        title="Anomalies"
        subtitle="SKUs whose revenue moved unusually, with the likely reason and what to do"
        actions={<ButtonLink href="/dashboard">Dashboard</ButtonLink>}
      />
      <div className={`${shell.page} ${styles.page}`}>
        <AnomalyList
          anomalies={current}
          title="Last 7 days"
          explain
          emptyText="No SKU moved unusually over the last 7 days."
          className={styles.pageCard}
        />

        {flagged.length > 0 && (
          <>
            <h2 className={styles.pageHeading}>Flagged in recent reports</h2>
            {flagged.map((r) => (
              <AnomalyList
                key={r.id}
                anomalies={r.anomalies}
                title={`${r.title.charAt(0).toUpperCase()}${r.title.slice(1)} · ${formatDateTime(r.generatedAt)}`}
                explain
                className={styles.pageCard}
                aside={
                  <Link href={`/reports?report=${encodeURIComponent(r.id)}`} className={styles.explain}>
                    Open report
                    <ArrowRight size={14} strokeWidth={2} aria-hidden />
                  </Link>
                }
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

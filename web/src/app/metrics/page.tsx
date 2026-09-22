import type { Metadata } from "next";
import { MetricCard } from "@/components/metrics/MetricCard";
import styles from "@/components/metrics/metrics.module.css";
import { TopBar } from "@/components/shell/TopBar";
import shell from "@/components/shell/shell.module.css";
import { DomainTag } from "@/components/ui";
import { listMetrics } from "@/lib/data";
import type { Domain } from "@/lib/types";

export const metadata: Metadata = { title: "Metrics" };

const DOMAINS: Domain[] = ["sales", "inventory", "accounting"];

export default async function MetricsPage() {
  const metrics = await listMetrics();

  return (
    <>
      <TopBar title="Metrics" subtitle="The governed metric layer — every number Sage reports comes from one of these" />
      <div className={shell.page}>
      {DOMAINS.map((domain) => {
        const inDomain = metrics.filter((m) => m.owner_domain === domain);
        if (!inDomain.length) return null;
        return (
          <section key={domain} className={styles.domain}>
            <h2 className={styles.domainTitle}>
              <DomainTag domain={domain} /> <span>· {inDomain.length}</span>
            </h2>
            <div className={styles.grid}>
              {inDomain.map((m) => (
                <MetricCard key={m.id} metric={m} />
              ))}
            </div>
          </section>
        );
      })}
      </div>
    </>
  );
}

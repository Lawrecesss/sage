import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/charts/BarChart";
import { BarList } from "@/components/charts/BarList";
import styles from "@/components/dashboard/dashboard.module.css";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { RecommendedPanel } from "@/components/dashboard/RecommendedPanel";
import { TopBar } from "@/components/shell/TopBar";
import shell from "@/components/shell/shell.module.css";
import { SignalTable } from "@/components/signals/SignalTable";
import { ButtonLink, Card, ChipLink, EmptyState } from "@/components/ui";
import { getDomainDashboard, getRecommended, listMetrics, listSignals } from "@/lib/data";
import { formatAxis, formatMetricValue } from "@/lib/format";
import type { DashboardChartBlock, Domain } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const DOMAINS: Domain[] = ["sales", "inventory", "accounting"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; rec?: string }>;
}) {
  const params = await searchParams;
  const domain = DOMAINS.find((d) => d === params.domain) ?? "sales";

  const [dash, recommended, signals, metrics] = await Promise.all([
    getDomainDashboard(domain),
    getRecommended(),
    listSignals({ domain, status: "open" }),
    listMetrics(),
  ]);
  const byId = new Map(metrics.map((m) => [m.id, m]));

  return (
    <>
      <TopBar
        title="Dashboard"
        tabs={
          <span style={{ display: "flex", gap: 4 }}>
            {DOMAINS.map((d) => (
              <ChipLink key={d} href={`/dashboard?domain=${d}`} active={d === domain}>
                {d}
              </ChipLink>
            ))}
          </span>
        }
        subtitle="Sep 2026 · all channels"
        actions={<ButtonLink href="/?q=%2Fmorning-brief">Ask Sage</ButtonLink>}
      />

      <div className={shell.page}>
        <KpiGrid kpis={dash.kpis} />

        <RecommendedPanel
          metrics={recommended.metrics}
          frequency={recommended.frequency}
          updatedAt={recommended.updated_at}
          defaultOpen={params.rec === "open"}
        />

        <div className={styles.charts}>
          {dash.charts.map((chart) => (
            <Card key={chart.title} title={chart.title}>
              <ChartBody chart={chart} />
            </Card>
          ))}
        </div>

        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Open signals · {domain}</h2>
          <Link href="/signals" className={styles.link}>
            All signals →
          </Link>
        </div>
        <Card>
          {signals.length ? (
            <SignalTable signals={signals} metrics={byId} />
          ) : (
            <EmptyState title="Nothing open">No open signals in {domain} right now.</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}

function ChartBody({ chart }: { chart: DashboardChartBlock }) {
  if (chart.kind === "list") {
    return <BarList rows={chart.data} format={(v) => formatMetricValue(v, chart.unit)} />;
  }
  return (
    <BarChart
      data={chart.data}
      format={(v) => formatAxis(v, chart.unit)}
      seriesLabels={chart.seriesLabels}
      title={chart.title}
    />
  );
}

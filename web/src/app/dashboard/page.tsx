import { ArrowRight, CalendarDays, CircleCheck, MessageSquare, Store } from "lucide-react";
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
import { ButtonLink, Card, EmptyState, SegmentedLinks } from "@/components/ui";
import { getDomainDashboard, getRecommended, listMetrics, listSignals } from "@/lib/data";
import { formatMetricValue } from "@/lib/format";
import type { DashboardChartBlock, Domain } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const DOMAINS: Domain[] = ["sales", "inventory", "accounting"];
const LABEL: Record<Domain, string> = { sales: "Sales", inventory: "Inventory", accounting: "Accounting" };

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
  const byImpact = [...signals].sort((a, b) => Math.abs(b.dollar_impact_est) - Math.abs(a.dollar_impact_est));

  return (
    <>
      <TopBar
        title="Dashboard"
        tabs={
          <>
            <SegmentedLinks
              label="Domain"
              items={DOMAINS.map((d) => ({ href: `/dashboard?domain=${d}`, label: LABEL[d], active: d === domain }))}
            />
            {/* The reporting scope. Shown as a summary — the data layer has no range/channel filter yet. */}
            <span className={styles.scope} aria-label="Reporting period: September 2026, all channels">
              <span className={styles.scopePart}>
                <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
                Sep 2026
              </span>
              <span className={styles.scopeDivider} aria-hidden />
              <span className={styles.scopePart}>
                <Store size={16} strokeWidth={1.75} aria-hidden />
                All channels
              </span>
            </span>
          </>
        }
        actions={
          <ButtonLink href="/?q=%2Fmorning-brief" icon={MessageSquare}>
            Ask Sage
          </ButtonLink>
        }
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
          {dash.charts.map((chart) => {
            const [title, ...rest] = chart.title.split(" · ");
            return (
              <Card
                key={chart.title}
                title={title}
                description={rest.join(" · ") || undefined}
                className={chart.kind === "list" ? styles.chartHalf : styles.chartWide}
              >
                <ChartBody chart={chart} />
              </Card>
            );
          })}
        </div>

        <Card
          flush
          title="Open signals"
          description={`${LABEL[domain]} · ranked by estimated impact`}
          aside={
            <Link href="/signals" className={styles.link}>
              All signals
              <ArrowRight size={14} strokeWidth={2} aria-hidden />
            </Link>
          }
        >
          {byImpact.length ? (
            <SignalTable signals={byImpact} metrics={byId} />
          ) : (
            <EmptyState title="Nothing open" icon={CircleCheck}>
              No open signals in {domain} right now.
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}

function ChartBody({ chart }: { chart: DashboardChartBlock }) {
  if (chart.kind === "list") {
    return <BarList rows={chart.data} format={(v) => formatMetricValue(v, chart.unit)} share={chart.unit === "SGD"} />;
  }
  return <BarChart data={chart.data} unit={chart.unit} seriesLabels={chart.seriesLabels} title={chart.title} />;
}

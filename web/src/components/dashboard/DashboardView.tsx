"use client";

// All 3 domains' data is fetched ONCE by the server component (dashboard/page.tsx)
// in parallel, then handed here. Switching tabs is pure client-side state — no
// navigation, no re-fetch, no loading spinner needed, because there's nothing left
// to wait for. This replaces the earlier router.push()-per-click approach, which
// re-ran the full server-side SQL on every single tab click.
//
// Trade-off, stated plainly: the initial page load now does 3x the SQL work
// (all domains up front) instead of 1x — worth it since after that, tab
// switching is instant for the rest of the session.

import { useState } from "react";
import Link from "next/link";
import { BarChart } from "@/components/charts/BarChart";
import { BarList } from "@/components/charts/BarList";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { RecommendedPanel } from "@/components/dashboard/RecommendedPanel";
import { TopBar } from "@/components/shell/TopBar";
import shell from "@/components/shell/shell.module.css";
import { SignalTable } from "@/components/signals/SignalTable";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import styles from "@/components/ui/ui.module.css";
import dashStyles from "./dashboard.module.css";
import { formatAxis, formatMetricValue } from "@/lib/format";
import type { DashboardChartBlock, Domain, DomainDashboard, Metric, RecommendedMetric, Signal } from "@/lib/types";

export function DashboardView({
  domains,
  initialDomain,
  dashboards,
  signalsByDomain,
  metrics,
  recommended,
  recDefaultOpen,
}: {
  domains: Domain[];
  initialDomain: Domain;
  dashboards: Record<Domain, DomainDashboard>;
  signalsByDomain: Record<Domain, Signal[]>;
  metrics: Metric[];
  recommended: {
    metrics: RecommendedMetric[];
    frequency: { week: string; counts: Record<string, number> }[];
    updated_at: string;
  };
  recDefaultOpen: boolean;
}) {
  const [domain, setDomain] = useState<Domain>(initialDomain);
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const dash = dashboards[domain];
  const signals = signalsByDomain[domain];

  return (
    <>
      <TopBar
        title="Dashboard"
        tabs={
          <span style={{ display: "flex", gap: 4 }}>
            {domains.map((d) => (
              <button
                key={d}
                type="button"
                className={d === domain ? styles.chipActive : styles.chip}
                onClick={() => setDomain(d)}
              >
                {d}
              </button>
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
          defaultOpen={recDefaultOpen}
        />

        <div className={dashStyles.charts}>
          {dash.charts.map((chart) => (
            <Card key={chart.title} title={chart.title}>
              <ChartBody chart={chart} />
            </Card>
          ))}
        </div>

        <div className={dashStyles.sectionHead}>
          <h2 className={dashStyles.sectionTitle}>Open signals · {domain}</h2>
          <Link href="/signals" className={dashStyles.link}>
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

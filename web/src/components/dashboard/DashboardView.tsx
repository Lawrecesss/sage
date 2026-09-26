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

import { ArrowRight, CalendarDays, CircleCheck, MessageSquare, Store } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { BarChart } from "@/components/charts/BarChart";
import { BarList } from "@/components/charts/BarList";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { RecommendedPanel } from "@/components/dashboard/RecommendedPanel";
import { TopBar } from "@/components/shell/TopBar";
import shell from "@/components/shell/shell.module.css";
import { SignalTable } from "@/components/signals/SignalTable";
import { ButtonLink, Card, EmptyState, SegmentedButtons } from "@/components/ui";
import styles from "./dashboard.module.css";
import { formatMetricValue } from "@/lib/format";
import type { DashboardChartBlock, Domain, DomainDashboard, Metric, RecommendedMetric, Signal } from "@/lib/types";

const LABEL: Record<Domain, string> = { sales: "Sales", inventory: "Inventory", accounting: "Accounting" };

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
  const byImpact = [...signalsByDomain[domain]].sort(
    (a, b) => Math.abs(b.dollar_impact_est) - Math.abs(a.dollar_impact_est),
  );

  // Keep ?domain= in the URL so reloads and shared links land on the same tab — without a navigation.
  const selectDomain = (d: Domain) => {
    setDomain(d);
    const qs = new URLSearchParams(window.location.search);
    qs.set("domain", d);
    window.history.replaceState(null, "", `?${qs}`);
  };

  return (
    <>
      <TopBar
        title="Dashboard"
        tabs={
          <>
            <SegmentedButtons
              label="Domain"
              items={domains.map((d) => ({ value: d, label: LABEL[d] }))}
              value={domain}
              onChange={selectDomain}
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
          defaultOpen={recDefaultOpen}
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

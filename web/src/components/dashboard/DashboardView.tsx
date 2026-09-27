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

import { ArrowRight, CalendarDays, MessageSquare, Store } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { AnomalyList } from "@/components/anomalies/AnomalyList";
import { BarChart } from "@/components/charts/BarChart";
import { BarList } from "@/components/charts/BarList";
import { EnquiryPanel } from "@/components/dashboard/EnquiryPanel";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { RecommendedPanel } from "@/components/dashboard/RecommendedPanel";
import { TopBar } from "@/components/shell/TopBar";
import shell from "@/components/shell/shell.module.css";
import { ButtonLink, Card, SegmentedButtons } from "@/components/ui";
import styles from "./dashboard.module.css";
import { formatMetricValue } from "@/lib/format";
import type {
  Anomaly,
  DashboardChartBlock,
  Domain,
  DomainDashboard,
  EnquiryOverview,
  RecommendedMetric,
} from "@/lib/types";

const LABEL: Record<Domain, string> = { sales: "Sales", inventory: "Inventory", accounting: "Accounting" };
/** The dashboard shows the most severe few; /anomalies has the rest. */
const MAX_ANOMALIES = 4;

export function DashboardView({
  domains,
  initialDomain,
  dashboards,
  anomalies,
  recommended,
  enquiries,
  recDefaultOpen,
}: {
  domains: Domain[];
  initialDomain: Domain;
  dashboards: Record<Domain, DomainDashboard>;
  /** Not per-domain: the latest anomaly scan, the same on every tab. */
  anomalies: Anomaly[];
  recommended: {
    metrics: RecommendedMetric[];
    frequency: { week: string; counts: Record<string, number> }[];
    updated_at: string;
  };
  /** Not per-domain: the same section on every tab (see EnquiryPanel). */
  enquiries: EnquiryOverview | null;
  recDefaultOpen: boolean;
}) {
  const [domain, setDomain] = useState<Domain>(initialDomain);
  const dash = dashboards[domain];

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

        <AnomalyList
          anomalies={anomalies.slice(0, MAX_ANOMALIES)}
          title="Anomalies"
          explain
          emptyText="No SKU moved unusually over the last 7 days."
          className={styles.anomalyCard}
          aside={
            <Link href="/anomalies" className={styles.link}>
              {anomalies.length > MAX_ANOMALIES ? `All ${anomalies.length} anomalies` : "All anomalies"}
              <ArrowRight size={14} strokeWidth={2} aria-hidden />
            </Link>
          }
        />

        <EnquiryPanel overview={enquiries} />
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

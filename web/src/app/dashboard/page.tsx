import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getDomainDashboard, getRecommended, listMetrics, listSignals } from "@/lib/data";
import { resolveTenantForPage } from "@/lib/tenant";
import type { Domain } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const DOMAINS: Domain[] = ["sales", "inventory", "accounting"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; rec?: string }>;
}) {
  const params = await searchParams;
  const initialDomain = DOMAINS.find((d) => d === params.domain) ?? "sales";
  const { tenantId } = await resolveTenantForPage();

  // All 3 domains fetched once, in parallel — tab switching afterward is pure
  // client-side state (DashboardView), not a new navigation/re-fetch. See that
  // file's header comment for why.
  const [dashList, signalsList, recommended, metrics] = await Promise.all([
    Promise.all(DOMAINS.map((d) => getDomainDashboard(tenantId, d))),
    Promise.all(DOMAINS.map((d) => listSignals(tenantId, { domain: d, status: "open" }))),
    getRecommended(),
    listMetrics(),
  ]);

  const dashboards = Object.fromEntries(DOMAINS.map((d, i) => [d, dashList[i]])) as Record<
    Domain,
    (typeof dashList)[number]
  >;
  const signalsByDomain = Object.fromEntries(DOMAINS.map((d, i) => [d, signalsList[i]])) as Record<
    Domain,
    (typeof signalsList)[number]
  >;

  return (
    <DashboardView
      domains={DOMAINS}
      initialDomain={initialDomain}
      dashboards={dashboards}
      signalsByDomain={signalsByDomain}
      metrics={metrics}
      recommended={recommended}
      recDefaultOpen={params.rec === "open"}
    />
  );
}

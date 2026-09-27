import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getDomainDashboard, getEnquiryOverview, getRecommended, listCurrentAnomalies } from "@/lib/data";
import { resolveTenantIdForPage } from "@/lib/tenant";
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
  const tenantId = await resolveTenantIdForPage();

  // All 3 domains fetched once, in parallel — tab switching afterward is pure
  // client-side state (DashboardView), not a new navigation/re-fetch. See that
  // file's header comment for why.
  const [dashList, anomalies, recommended, enquiries] = await Promise.all([
    Promise.all(DOMAINS.map((d) => getDomainDashboard(tenantId, d))),
    listCurrentAnomalies(tenantId),
    getRecommended(),
    getEnquiryOverview(tenantId),
  ]);

  const dashboards = Object.fromEntries(DOMAINS.map((d, i) => [d, dashList[i]])) as Record<
    Domain,
    (typeof dashList)[number]
  >;

  return (
    <DashboardView
      domains={DOMAINS}
      initialDomain={initialDomain}
      dashboards={dashboards}
      anomalies={anomalies}
      recommended={recommended}
      enquiries={enquiries}
      recDefaultOpen={params.rec === "open"}
    />
  );
}

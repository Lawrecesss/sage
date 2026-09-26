import type { Metadata } from "next";
import { ReportsExplorer } from "@/components/reports/ReportsExplorer";
import { listReports } from "@/lib/data";
import { resolveTenantIdForPage } from "@/lib/tenant";
import type { ReportKind } from "@/lib/types";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const KINDS: ReportKind[] = [
  "morning-brief",
  "afternoon-report",
  "evening-report",
  "daily-report",
  "weekly-report",
  "six-hour-report",
];

/** Server component's only job: the initial fetch. Selecting a report, filtering by kind or
 * search, and paging through the list are all client-side from here — see ReportsExplorer for
 * why (a Next.js router bug, not a stylistic choice). `searchParams` still seeds the initial
 * state so a reload or a shared `/reports?report=...` link lands on the same report. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; kind?: string; q?: string }>;
}) {
  const params = await searchParams;
  const tenantId = await resolveTenantIdForPage();
  const all = await listReports(tenantId);

  return (
    <ReportsExplorer
      all={all}
      initialReportId={params.report}
      initialKind={KINDS.find((k) => k === params.kind)}
      initialQuery={params.q}
    />
  );
}

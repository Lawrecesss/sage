import { PageSpinner } from "@/components/ui";

// Next's Suspense fallback for this route segment — shown while
// dashboard/page.tsx's async data fetch (getDomainDashboard/listSignals/...)
// is in flight, including on client-side navigations that re-suspend it
// (e.g. switching the domain tab).
export default function DashboardLoading() {
  return <PageSpinner label="Loading dashboard…" />;
}

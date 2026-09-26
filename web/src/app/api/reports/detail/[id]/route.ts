import { getReport } from "@/lib/data";
import { resolveTenantOrError } from "@/lib/tenant";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET -> a single saved report's full body (blocks), for the Reports page's client-side
 * selection (see ReportsExplorer). The list view never needs `blocks` (report-store.ts's
 * listReports already excludes it) — this is the one place that fetches it, on demand, only
 * for whichever report is currently selected.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveTenantOrError(req);
  if ("error" in resolved) return resolved.error;

  const { id } = await params;
  const report = await getReport(resolved.tenant.tenantId, id);
  if (!report) return Response.json({ error: "report not found" } satisfies ApiError, { status: 404 });
  return Response.json(report);
}

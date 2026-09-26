import { getReport } from "@/lib/data";
import { renderReportPdf, reportPdfName } from "@/lib/report-pdf";
import { resolveTenantOrError } from "@/lib/tenant";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> the saved report `id` as a PDF download (see lib/report-pdf.ts). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveTenantOrError(req);
  if ("error" in resolved) return resolved.error;

  const report = await getReport(resolved.tenant.tenantId, (await params).id);
  if (!report) return Response.json({ error: "unknown report" } satisfies ApiError, { status: 404 });

  const pdf = await renderReportPdf(report);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportPdfName(report)}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
    },
  });
}

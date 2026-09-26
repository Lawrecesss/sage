import { deleteReport } from "@/lib/data";
import { resolveTenantOrError } from "@/lib/tenant";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE -> 204 once the saved report `id` is gone, 404 if there was no such report. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveTenantOrError(req);
  if ("error" in resolved) return resolved.error;

  const deleted = await deleteReport(resolved.tenant.tenantId, (await params).id);
  return deleted
    ? new Response(null, { status: 204 })
    : Response.json({ error: "unknown report" } satisfies ApiError, { status: 404 });
}

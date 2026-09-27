import { listCurrentAnomalies } from "@/lib/data";
import { resolveTenantOrError } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** GET -> Anomaly[]: the current anomaly scan (last 7 complete days vs the 7 before). */
export async function GET(req: Request) {
  const resolved = await resolveTenantOrError(req);
  if ("error" in resolved) return resolved.error;
  return Response.json(await listCurrentAnomalies(resolved.tenant.tenantId));
}

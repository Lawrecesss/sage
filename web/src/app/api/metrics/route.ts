import { listMetrics } from "@/lib/data";
import { resolveTenantOrError } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** GET → the governed metric catalog. */
export async function GET(req: Request) {
  const resolved = await resolveTenantOrError(req);
  if ("error" in resolved) return resolved.error;

  return Response.json(await listMetrics());
}

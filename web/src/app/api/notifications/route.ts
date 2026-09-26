import { listNotifications } from "@/lib/notifications";
import { resolveTenantOrError } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** GET -> the notification bell's feed: anomalies from recent report runs, newest run first. */
export async function GET(req: Request) {
  const resolved = await resolveTenantOrError(req);
  if ("error" in resolved) return resolved.error;
  return Response.json(await listNotifications(resolved.tenant.tenantId));
}

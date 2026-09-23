import { getLatestBrief } from "@/lib/data";
import { resolveTenantOrError } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** GET → latest Morning Brief, or 404 if none has been generated yet. */
export async function GET(req: Request) {
  const resolved = await resolveTenantOrError(req);
  if ("error" in resolved) return resolved.error;

  const brief = await getLatestBrief();
  return brief ? Response.json(brief) : Response.json({ error: "no brief yet" }, { status: 404 });
}

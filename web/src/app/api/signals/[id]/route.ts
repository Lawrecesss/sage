import { getSignal } from "@/lib/data";
import { resolveTenantOrError } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** GET → one signal by id. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveTenantOrError(req);
  if ("error" in resolved) return resolved.error;

  const signal = await getSignal((await params).id);
  return signal ? Response.json(signal) : Response.json({ error: "unknown signal" }, { status: 404 });
}

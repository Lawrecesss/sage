import { listSignals } from "@/lib/data";
import type { Domain, SignalStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: SignalStatus[] = ["open", "acknowledged", "resolved"];
const DOMAINS: Domain[] = ["sales", "inventory", "accounting"];

/** GET ?status=&domain=&limit= → signals, highest score first. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const status = STATUSES.find((s) => s === params.get("status"));
  const domain = DOMAINS.find((d) => d === params.get("domain"));
  const limit = Math.min(Math.max(Number(params.get("limit")) || 100, 1), 500);
  return Response.json(await listSignals({ status, domain, limit }));
}

import { listMetrics } from "@/lib/data";

/** GET → the governed metric catalog. */
export async function GET() {
  return Response.json(await listMetrics());
}

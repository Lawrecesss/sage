import { getSignal } from "@/lib/data";

export const dynamic = "force-dynamic";

/** GET → one signal by id. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const signal = await getSignal((await params).id);
  return signal ? Response.json(signal) : Response.json({ error: "unknown signal" }, { status: 404 });
}

import { getLatestBrief } from "@/lib/data";

export const dynamic = "force-dynamic";

/** GET → latest Morning Brief, or 404 if none has been generated yet. */
export async function GET() {
  const brief = await getLatestBrief();
  return brief ? Response.json(brief) : Response.json({ error: "no brief yet" }, { status: 404 });
}

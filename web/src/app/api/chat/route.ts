import { agentResponse, parseChatRequest } from "@/lib/agent-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST ChatRequest -> streamed agent reply (ChatResponse). */
export async function POST(req: Request) {
  const parsed = parseChatRequest(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json(parsed.error, { status: 400 });

  return agentResponse(req, parsed.value.message, parsed.value.sessionId);
}

import { OpenClawError, streamAgentReply } from "@/lib/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_MESSAGE_CHARS = 4000;

/** POST { message, sessionId } -> streamed plain-text agent reply. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";

  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return Response.json({ error: "message is required (max 4000 chars)" }, { status: 400 });
  }
  if (!SESSION_ID.test(sessionId)) {
    return Response.json({ error: "invalid sessionId" }, { status: 400 });
  }

  try {
    const stream = await streamAgentReply(message, sessionId, req.signal);
    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/chat]", err);
    const status = err instanceof OpenClawError ? err.status : 502;
    return Response.json({ error: "agent unavailable" }, { status });
  }
}

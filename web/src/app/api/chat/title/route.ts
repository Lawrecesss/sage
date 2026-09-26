import { isValidSessionId } from "@/lib/agent-response";
import { OpenClawError, completeAgentReply } from "@/lib/openclaw";
import { resolveTenantOrError } from "@/lib/tenant";
import type { ApiError, ChatTitleRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TURNS = 12;
const MAX_TURN_CHARS = 600;
const MAX_TITLE_CHARS = 60;

const SYSTEM =
  "You write short titles for chat conversations, like a chat app's sidebar. " +
  "Do not call any tools. Reply with the title only: 3 to 6 words, sentence case, " +
  "no quotes, no trailing punctuation. Summarise what the conversation is about " +
  "(the topic and any finding), not just the first question. Earlier messages in this " +
  "session are previous title requests for the same chat; title only the latest transcript.";

/**
 * POST ChatTitleRequest -> `{ title }`: a one-line summary of the conversation for the
 * sidebar's chat history. Runs through OpenClaw (traced like any other turn) under its own
 * conversation key, so it never touches the chat's own history.
 */
export async function POST(req: Request) {
  const parsed = parseTitleRequest(await req.json().catch(() => null));
  if ("error" in parsed) return Response.json(parsed, { status: 400 });

  const resolved = await resolveTenantOrError(req);
  if ("error" in resolved) return resolved.error;
  const { tenantId } = resolved.tenant;

  const transcript = parsed.transcript
    .map((t) => `${t.role === "user" ? "User" : "Sage"}: ${t.text}`)
    .join("\n\n");

  try {
    const reply = await completeAgentReply(
      SYSTEM,
      `Transcript:\n\n${transcript}\n\nTitle:`,
      `web:${tenantId}:title:${parsed.sessionId}`,
      req.signal,
    );
    const title = cleanTitle(reply);
    if (!title) return Response.json({ error: "empty title" } satisfies ApiError, { status: 502 });
    return Response.json({ title });
  } catch (err) {
    console.error("[/api/chat/title]", err);
    const status = err instanceof OpenClawError ? err.status : 502;
    return Response.json({ error: "agent unavailable" } satisfies ApiError, { status });
  }
}

function parseTitleRequest(body: unknown): ChatTitleRequest | ApiError {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isValidSessionId(b.sessionId)) return { error: "invalid sessionId" };
  if (!Array.isArray(b.transcript) || b.transcript.length === 0) return { error: "transcript is required" };
  const transcript = b.transcript
    .slice(-MAX_TURNS)
    .filter(
      (t): t is ChatTitleRequest["transcript"][number] =>
        !!t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string" && t.text.trim() !== "",
    )
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, MAX_TURN_CHARS) }));
  if (!transcript.some((t) => t.role === "user")) return { error: "transcript needs a user turn" };
  return { sessionId: b.sessionId, transcript };
}

/** First line, without markdown emphasis, wrapping quotes or trailing punctuation. */
function cleanTitle(reply: string): string {
  const line = reply.trim().split("\n")[0] ?? "";
  const title = line
    .replace(/^(title:\s*)/i, "")
    .replace(/[*_#`]/g, "")
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .replace(/[.。!?]+$/, "")
    .trim();
  return title.length > MAX_TITLE_CHARS ? `${title.slice(0, MAX_TITLE_CHARS - 1)}…` : title;
}

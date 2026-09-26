// Server-only client for the OpenClaw gateway's OpenAI-compatible endpoint.
// The gateway token grants operator access — never import this from client code.

const OPENCLAW_URL = process.env.OPENCLAW_URL ?? "http://127.0.0.1:18789";

export class OpenClawError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Runs one agent turn and returns the reply as a stream of text deltas.
 *
 * OpenClaw keeps conversation history server-side, keyed by `user`, so only the
 * new message is sent. Tool calls (retail MCP) happen inside the gateway's loop.
 *
 * OpenClaw's MCP config is static and shared across every tenant's requests
 * (ARCHITECTURE.md §9) — there's no native per-request tool-call context
 * injection, so tenant_id is threaded through as a system message instead,
 * with the model instructed to pass it verbatim on tenant-scoped tool calls.
 * retail-mcp independently validates tenant_id server-side; this is not a
 * hard security boundary against a fully adversarial prompt injection.
 */
export async function streamAgentReply(
  message: string,
  sessionId: string,
  tenantId: string,
  modules: string[],
  signal?: AbortSignal,
): Promise<ReadableStream<string>> {
  const token = process.env.OPENCLAW_TOKEN;
  if (!token) throw new OpenClawError("OPENCLAW_TOKEN is not set", 500);

  const res = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openclaw/default",
      user: `web:${tenantId}:${sessionId}`,
      stream: true,
      messages: [
        {
          role: "system",
          content: `You are assisting tenant "${tenantId}". Enabled modules: ${modules.join(", ") || "none"}. When calling a tenant-scoped tool, always pass tenant_id="${tenantId}" exactly.`,
        },
        { role: "user", content: message },
      ],
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new OpenClawError(`OpenClaw responded ${res.status}: ${await res.text()}`, 502);
  }

  return res.body.pipeThrough(new TextDecoderStream()).pipeThrough(sseContentDeltas());
}

/**
 * One non-streaming turn for small side tasks (e.g. titling a chat). `conversationKey` is the
 * OpenClaw history key — keep it separate from the user's own conversation so side tasks never
 * show up in (or read from) that history.
 */
export async function completeAgentReply(
  system: string,
  message: string,
  conversationKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const token = process.env.OPENCLAW_TOKEN;
  if (!token) throw new OpenClawError("OPENCLAW_TOKEN is not set", 500);

  const res = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openclaw/default",
      user: conversationKey,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
    signal,
  });
  if (!res.ok) throw new OpenClawError(`OpenClaw responded ${res.status}: ${await res.text()}`, 502);
  const body = await res.json();
  return typeof body.choices?.[0]?.message?.content === "string" ? body.choices[0].message.content : "";
}

/** Turns an OpenAI chat-completions SSE stream into its `delta.content` strings. */
function sseContentDeltas(): TransformStream<string, string> {
  let buffer = "";
  return new TransformStream({
    transform(chunk, controller) {
      buffer += chunk;
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          const content = JSON.parse(data).choices?.[0]?.delta?.content;
          if (content) controller.enqueue(content);
        }
      }
    },
  });
}

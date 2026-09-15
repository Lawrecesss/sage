// POST /api/ask (SSE stream) — proxies the sage-ask OpenClaw agent, forwarding
// chunks from src/server/agent.ts's streamAsk() straight through. The
// frontend's SSE contract (src/lib/api-client.ts) doesn't change — only what
// is on the other end of this route does.
// STUB — structure only, no implementation yet.
import { NextResponse } from "next/server";

export async function POST() {
  // TODO: implement
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}

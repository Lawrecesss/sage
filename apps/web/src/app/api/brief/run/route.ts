// POST /api/brief/run — inserts an `agent_runs` row (status `queued`) and
// kicks off the sage-briefing OpenClaw agent (see src/server/agent.ts);
// returns 202 with the run_id immediately, poll via GET /api/runs/[id]. No
// separate worker process — see docs/decisions/0003-openclaw-agent-runtime.md.
// (The scheduled path — OpenClaw's own daily automation,
// agent/openclaw/automations/daily-brief.md — doesn't go through this route;
// it calls the sage-briefing agent directly. This route is the web app's
// manual "run it now" trigger.)
// STUB — structure only, no implementation yet.
import { NextResponse } from "next/server";

export async function POST() {
  // TODO: implement
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}

"""GET /brief/latest, GET /brief/{id}, POST /brief/run.

POST /brief/run inserts a row into the `agent_runs` table (status `queued`),
schedules a FastAPI `BackgroundTasks` job that calls `sage_api.agent.run_briefing`
and marks the row `running` -> `done`/`error` as it goes, and returns 202 with the
`run_id` immediately. See sage_api.routers.runs for polling that row.

No separate `worker` process/container — the old sage_agents.runtime worker loop
is gone; see docs/decisions/0003-openclaw-agent-runtime.md. (The scheduled path —
OpenClaw's own daily automation, openclaw/automations/daily-brief.md — doesn't
go through this endpoint at all; it calls the sage-briefing agent directly. This
endpoint remains for the web app's manual "run it now" trigger.)

GET /brief/latest always returns the last row in `briefings` — the API's
graceful-degradation story: a failed run never removes the previous good brief.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/plans/m4-platform.md for what belongs here.
"""

# TODO: implement

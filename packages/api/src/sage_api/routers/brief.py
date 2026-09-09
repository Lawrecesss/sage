"""GET /brief/latest, GET /brief/{id}, POST /brief/run.

POST /brief/run inserts a row into the `agent_runs` table (status `queued`) and
returns 202 — the `worker` process (sage_agents.runtime) picks it up. No queue
service; see docs/decisions/0002-lightsail-single-instance.md.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/plans/m4-platform.md for what belongs here.
"""

# TODO: implement

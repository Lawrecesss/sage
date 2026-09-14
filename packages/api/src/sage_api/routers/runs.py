"""GET /runs/{run_id} — poll a triggered `agent_runs` row.

Lets the web app poll a run started by `POST /brief/run` (202 + run_id) until it
flips to `done` (then fetch the brief) or `error` (then show the failure and
fall back to `GET /brief/latest`). Replaces the old design where the `worker`
container was the only thing watching `agent_runs` — now the API's own
background task is, so this is just a read of that table.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/decisions/0003-openclaw-agent-runtime.md.
"""

# TODO: implement

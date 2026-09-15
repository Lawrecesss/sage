# platform/api

FastAPI service (uvicorn, containerised, behind Caddy). Owned by M4. The only
public entry point — never calls an LLM directly, always through OpenClaw (see
`sage_api.agent`). REST + SSE; `POST /brief/run` inserts a row into the
`agent_runs` table and drives the OpenClaw call from a `BackgroundTasks` job (no
separate worker process, no queue service — see
docs/decisions/0003-openclaw-agent-runtime.md). Response schemas mirror docs/contracts/.

> STUB — structure only, no implementation yet.

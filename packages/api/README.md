# packages/api

FastAPI service (uvicorn, containerised, behind Caddy). Owned by M4. REST + SSE;
`POST /brief/run` inserts a row into the `agent_runs` table (the `worker` picks it
up — no queue service). Response schemas mirror docs/contracts/.

> STUB — structure only, no implementation yet.

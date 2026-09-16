# Sage

An agentic monitoring layer for retail / e-commerce SMEs.

## Layout

Each deployed service is independently buildable: its own `Dockerfile`, its own
lockfile, no shared workspace. The root `docker-compose.yml` wires them together.
`data/models` is the one exception — a plain library (no Dockerfile, not in
compose) that `data/simulator` depends on via a local path dependency, and that
`data/schemas` is generated from.

- `mcp/` — MCP server, Sage's governed tool surface, served to OpenClaw
- `openclaw/` — agent runtime config (prompts, automations)
- `data/models/` — shared entity shapes (Supplier, Sku, CustomerSegment) — the domain
  vocabulary every service mirrors; `data/schemas/` is generated from it
- `data/simulator/` — synthetic dataset seeding + planted incident library
- `data/schemas/` — generated JSON Schema (`sage-models-export`), never hand-edited
- `platform/notifier/` — pushes the morning brief to Telegram
- `web/` — Next.js frontend

Most services are currently skeletons: entity/schema models only, business logic
not yet implemented.

## Running

```
docker compose up -d db mcp openclaw web
docker compose --profile jobs up simulator notifier
```

Copy `.env.example` to `.env` first.

### Agent flow

```
browser ──> web  POST /api/chat ──> openclaw  POST /v1/chat/completions ──> agent loop ──> mcp (sage tools)
            (Next.js, holds token)  (headless gateway, 127.0.0.1:18789)                    (FastMCP, 127.0.0.1:9100/mcp)
```

- `web/src/app/api/chat/route.ts` takes `{ message, sessionId }` and streams back plain text.
  The OpenClaw token stays server-side (`web/src/lib/openclaw.ts`).
- OpenClaw keeps conversation history per `sessionId` (sent as the OpenAI `user` field).
- `openclaw/openclaw.json` runs the gateway headless: HTTP API only, tools restricted to the
  sage MCP server, no cron/heartbeat/memory. Agent instructions live in `openclaw/workspace/AGENTS.md`.
- LLM: any OpenAI-compatible endpoint via `LLM_GATEWAY_URL` / `LLM_GATEWAY_API_KEY` / `LLM_MODEL` in `.env`.

Try it: open http://127.0.0.1:3000, or

```
curl -N http://127.0.0.1:3000/api/chat -H "Content-Type: application/json" \
  -d '{"message":"Which open signal costs us the most?","sessionId":"demo-session-1"}'
docker compose exec openclaw node openclaw.mjs mcp probe   # check OpenClaw sees sage's tools
```

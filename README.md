# Sage

An agentic monitoring layer for retail / e-commerce SMEs.

## Layout

Each top-level folder is an independently buildable microservice: its own
`Dockerfile`, its own lockfile, no shared workspace. The root `docker-compose.yml`
wires them together.

- `mcp/` — MCP server, Sage's governed tool surface, served to OpenClaw
- `openclaw/` — agent runtime config (prompts, automations)
- `data/generator/` — synthetic dataset entity models
- `data/warehouse/` — star schema / metric layer
- `data/detectors/` — anomaly detection
- `data/evals/` — agent eval harness
- `platform/notifier/` — pushes the morning brief to Telegram
- `web/` — Next.js frontend

Most services are currently skeletons: entity/schema models only, business logic
not yet implemented.

## Running

```
docker compose up -d db mcp openclaw web
docker compose --profile jobs up generator warehouse detectors evals notifier
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

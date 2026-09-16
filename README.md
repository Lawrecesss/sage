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

### Tracing

OpenClaw exports OTLP traces straight to Langfuse Cloud — one trace per chat
turn, with a span per model call and per sage MCP tool call. Set
`LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` in `.env`
(blank keys = tracing off) and `docker compose up -d --build openclaw`.

Two things are easy to miss. OpenClaw's `diagnostics-otel` plugin ships
*disabled*, and while it is, a `diagnostics.otel` block is inert — spans are
still created and sampled, so logs carry a `traceId`, but nothing exports them;
`plugins.entries` in `openclaw.json` turns it on. And `openclaw/render-otel.mjs`
writes the `otel` block at container start rather than it being checked in,
because the exporter needs `base64(publicKey:secretKey)` as its auth header and
`${VAR}` interpolation only substitutes into strings.

Langfuse ingests the traces signal only, so metrics and logs stay off.

```
docker compose exec openclaw node openclaw.mjs plugins list | grep diagnostics
docker compose exec openclaw node openclaw.mjs config get diagnostics
```

`LANGFUSE_CAPTURE_CONTENT=false` ships span metadata (model, latency, token
usage, tool names) without prompt, completion or tool-payload bodies.
`LANGFUSE_SAMPLE_RATE` (0–1) thins root spans.

Try it: open http://127.0.0.1:3000, or

```
curl -N http://127.0.0.1:3000/api/chat -H "Content-Type: application/json" \
  -d '{"message":"Which open signal costs us the most?","sessionId":"demo-session-1"}'
docker compose exec openclaw node openclaw.mjs mcp probe   # check OpenClaw sees sage's tools
```

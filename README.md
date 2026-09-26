# Sage

An agentic monitoring layer for retail / e-commerce SMEs.

## Layout

Each deployed service is independently buildable: its own `Dockerfile`, its own
lockfile, no shared workspace. The root `docker-compose.yml` wires them together.
`data/models` is the one exception — a plain library (no Dockerfile, not in
compose) that `data/simulator` depends on via a local path dependency, and that
`data/schemas` is generated from.

- `mcp/` — `retail-mcp`, the retail module's MCP server (tenant-scoped, schema-agnostic tools)
- `openclaw/` — agent runtime config (prompts, automations)
- `data/models/` — shared entity shapes (Supplier, Sku, CustomerSegment) — the domain
  vocabulary every service mirrors; `data/schemas/` is generated from it
- `data/simulator/` — synthetic dataset seeding + planted incident library
- `data/schemas/` — generated JSON Schema (`sage-models-export`), never hand-edited
- `platform/notifier/` — pushes the morning brief to Telegram
- `platform/cron-monitor/` — runs the anomaly-monitor report on a fixed schedule (default
  every 6h) for every active tenant
- `web/` — Next.js frontend

Most services are still skeletons (entity/schema models only, business logic not
yet implemented) — `data/simulator` and `platform/cron-monitor` are the exceptions:
the former fully seeds a synthetic dataset (orders, stock, invoices/bills, planted
incidents) into Postgres, the latter runs the scheduled anomaly monitor described below.

## Running

Copy `.env.example` to `.env` first.

A `Makefile` at the repo root wraps the common commands — run `make help` to
list them:

```
make up      # start db, retail-mcp, openclaw, web
make seed    # (re)seed the synthetic dataset for a tenant into Postgres (default: demo) — see data/simulator
make jobs    # run every one-off job container (simulator, notifier)
make down    # stop everything
```

Or drive `docker compose` directly:

```
docker compose up -d db retail-mcp openclaw web
docker compose --profile jobs up simulator notifier
```

Seed a second tenant with `make seed tenant=acme` — each tenant gets its own
Postgres schema, isolated from every other tenant's data. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full multi-tenant model.

### Agent flow

```
browser ──> web  POST /api/chat ──> openclaw  POST /v1/chat/completions ──> agent loop ──> retail-mcp (tenant-scoped tools)
            (Next.js, holds token,             (headless gateway, 127.0.0.1:18789)                    (FastMCP, 127.0.0.1:9100/mcp)
            resolves tenant_id + modules)
```

- `web/src/app/api/chat/route.ts` takes `{ message, sessionId }` and streams back plain text.
  The OpenClaw token stays server-side (`web/src/lib/openclaw.ts`).
- **Tenancy** (dev-mode only, no real auth yet — see `ARCHITECTURE.md` §9): `web` resolves
  `tenant_id` from the `x-tenant-id` request header, falling back to `DEFAULT_TENANT_ID`
  (default `demo`), and looks up its enabled modules from `shared.tenant_modules`
  (`web/src/lib/tenant.ts`). An unknown/inactive tenant gets a `404` before OpenClaw is
  ever called. Tenant + modules are passed to OpenClaw as a system message plus the
  `user` field (`web:${tenantId}:${sessionId}`); OpenClaw keeps conversation history keyed
  by that combined value.
- `openclaw/openclaw.json` runs the gateway headless: HTTP API only, tools restricted to the
  `retail` MCP server, no cron/heartbeat/memory. Agent instructions live in `openclaw/workspace/AGENTS.md`.
- `retail-mcp` validates `tenant_id` against `shared.tenants`/`shared.tenant_modules` on every
  tool call before touching that tenant's Postgres schema — it doesn't just trust the value
  the model passed.
- LLM: OpenRouter via `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` in `.env`.

### Scheduled monitoring

```
cron-monitor  (every CRON_INTERVAL_HOURS, default 6h)
  └─> for each active tenant with `retail` enabled (shared.tenants/shared.tenant_modules)
        └─> POST web /api/reports/anomaly-report  (x-tenant-id: <tenant>)
              — the same agent turn + tenant scoping + storage as any other report
```

`platform/cron-monitor` is a small always-on service (no UI, no MCP tools of its own) that
wakes on a fixed schedule and calls web's existing report endpoint once per active tenant —
the same one the Reports page's "Generate now" button and the `/morning-brief` slash command
use. The agent does the actual detection with the retail tools it already has
(`get_attention_items`, `get_benchmark_gap_analysis`, `compare_periods`, …); the report kind
is `anomaly-report`, filterable on `/reports` under the "Cron monitor" chip. See
`web/src/lib/commands.ts` for the prompt and `platform/cron-monitor/src/sage_cron_monitor/`
for the schedule.

Run it once on demand instead of waiting for the schedule: `make monitor-now`.

### Tracing

OpenClaw exports OTLP traces straight to Langfuse Cloud — one trace per chat
turn, with a span per model call and per retail MCP tool call. Set
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
  -H "x-tenant-id: demo" \
  -d '{"message":"What was our revenue trend last month?","sessionId":"demo-session-1"}'
docker compose exec openclaw node openclaw.mjs mcp probe   # check OpenClaw sees retail's tools
```

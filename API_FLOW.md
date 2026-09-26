# API-Level Data Flow: web ↔ OpenClaw ↔ retail-mcp

How a chat message actually travels through the stack, at the HTTP/API level —
what calls what, over which endpoint, with which payload. Companion to
[`ARCHITECTURE.md`](./ARCHITECTURE.md) (the tenancy/scaling model),
[`MCP_TOOLS.md`](./MCP_TOOLS.md) (what each `retail-mcp` tool actually does),
and the README's "Agent flow" section (the short version); this is the
detailed one.

---

## 1. The two hops

There are exactly two network hops between a browser message and a reply, and
they use two different protocols:

```
browser ──1──> web (Next.js)  ──2──> OpenClaw ──(MCP protocol, internal)──> retail-mcp ──> Postgres
                                        │
                                        └─ back to web ─> back to browser (streamed)
```

**Hop 1 — browser → `web`.** Plain internal Next.js API route, not part of this
doc's scope: `POST /api/chat { message, sessionId }` on `web` itself
(`web/src/app/api/chat/route.ts`).

**Hop 2 — `web` → OpenClaw.** The one HTTP call `web` makes to the agent layer:

```
POST http://openclaw:18789/v1/chat/completions
Authorization: Bearer ${OPENCLAW_TOKEN}
Content-Type: application/json

{
  "model": "openclaw/default",
  "user": "web:${tenantId}:${sessionId}",
  "stream": true,
  "messages": [
    { "role": "system", "content": "You are assisting tenant \"${tenantId}\". Enabled modules: ${modules}. When calling a tenant-scoped tool, always pass tenant_id=\"${tenantId}\" exactly." },
    { "role": "user", "content": "${message}" }
  ]
}
```

Built in `web/src/lib/openclaw.ts` (`streamAgentReply`). Response is an SSE
stream of OpenAI-style `delta.content` chunks, decoded back into plain text and
piped to the browser.

**What happens between those two hops is invisible to `web`.** OpenClaw runs
its own agent loop inside that single request/response: it reads
`openclaw/workspace/AGENTS.md`, decides which `retail` MCP tools to call (zero,
one, or several times), and only returns once it's ready to answer. `web` never
sees the tool calls — it sees one message in, one streamed reply out.

---

## 2. Hop 2, internals: OpenClaw → retail-mcp

Not an HTTP call `web` or the browser can see — it's the **MCP protocol**
(streamable-http transport), configured once and used by OpenClaw's own
runtime, not application code:

```jsonc
// openclaw/openclaw.json
mcp: {
  servers: {
    retail: {
      url: "${MCP_URL}",           // -> http://retail-mcp:9100/mcp
      transport: "streamable-http",
      enabled: true,
    },
  },
},
```

When the LLM decides it needs data, OpenClaw's runtime calls one of 19 tools
exposed by `mcp/src/retail_mcp/server.py` — every parameter (`metric`,
`group_by`, `kind`, `status`, `breakdown`) is validated against a fixed
allowlist before any SQL is built, never passed through as-is. Full
reference, parameters, and return shapes: **[`MCP_TOOLS.md`](./MCP_TOOLS.md)**.
Short version:

- `describe_schema` — introspects the tenant's live Postgres schema
- `get_sales_timeseries` — revenue/units/refunds/margin/margin_pct over time
- `get_inventory_status` — current stock on hand
- `get_supplier_performance` — lead time and delivery delay per supplier
- `get_accounts_status` — outstanding receivables/payables
- `get_business_health_summary` — sales+inventory+supplier+accounts, one call
- `get_stockout_root_causes` — stockouts cross-referenced to supplier delay
- `compare_periods` — percent-change between two explicit date ranges
- `get_attention_items` — fixed-threshold checks across every domain, ranked
- `get_benchmark_gap_analysis` — sales/accounts outcomes vs. industry-typical ranges, gap and direction
- `get_trending_products` — SKUs genuinely rising vs. their own recent baseline
- `get_seasonal_pattern` — day-of-week/month/holiday patterns across full history
- `get_expected_deliveries` — purchase orders due in a date window
- `get_sku_lifecycle` — new/growing/stable/declining/dead classification per SKU
- `get_channel_performance` — store/online/click-and-collect side by side
- `get_cash_flow_forecast` — naive short-horizon cash projection
- `simulate_reorder_impact` — what-if: proposed PO qty/date vs. resulting stockout risk
- `get_data_freshness` — latest business-event date per source table

No tool covers customer enquiries or general "operational updates" — there's
no backing table for either anywhere in `data/simulator/src/sage_simulator/db/schema.py`.

Every call carries `tenant_id`, sourced from the system message OpenClaw was
given in hop 2 above — this is how tenant identity survives across the hop
`web` can't see into. `retail-mcp` does **not** trust that value blindly: every
tool call independently checks it against `shared.tenants`/
`shared.tenant_modules` (`retail_mcp/db.py::assert_tenant_active`) before
running any query, then `SET search_path TO "<tenant_id>"` scopes every
subsequent query to that tenant's schema.

---

## 3. Endpoint inventory

Only one endpoint ever carries conversation content. Everything else is
infrastructure:

| Endpoint | Carries chat content? | Called by |
|---|---|---|
| `openclaw:18789/v1/chat/completions` | **Yes — the only one** | `web`, or a manual Postman/curl test |
| `retail-mcp:9100/mcp` | No — MCP tool protocol | OpenClaw only, internally |
| `retail-mcp:9100/health` | No — liveness probe | Docker healthcheck, or manual curl |
| `db:5432` (Postgres) | No — direct SQL | `retail-mcp` (per-query), `web` (tenant resolution only, before OpenClaw is called — see `web/src/lib/tenant.ts`), the simulator (seeding) |

`openclaw.json`'s `gateway.http.endpoints` block only enables
`chatCompletions` — no other HTTP surface is turned on for OpenClaw's gateway
in this config.

---

## 4. Testing from the BFF layer (web) — for frontend/BFF developers

This is the test that actually exercises *your* code (`web/src/app/api/chat/route.ts`,
`web/src/lib/openclaw.ts`, `web/src/lib/tenant.ts`), not just the agent/MCP
layer underneath it. Use this to verify your BFF correctly reaches `retail-mcp`
end to end; use §5 below only to isolate *which* layer broke if this fails.

### 4.1 Prerequisites

1. `.env` exists (copied from `.env.example`) and is filled in — at minimum
   `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`, `OPENCLAW_TOKEN` (or
   leave blank to use compose's fallback `sage-dev-token`).
2. The stack is up: `docker compose up -d db retail-mcp openclaw web` (or
   `make up`).
3. At least one tenant is provisioned and seeded — `make seed` (defaults to
   tenant `demo`), or directly:
   `docker compose --profile jobs run --rm simulator sage-simulate --seed 42 --months 6 --tenant demo`.
   Skipping this means `web` will 404 with `"unknown tenant"` — that's not a
   bug in your BFF code, it's a missing prerequisite.

### 4.2 Confirm every layer is actually healthy before testing through `web`

```bash
docker compose ps                                    # all four should show healthy/running
curl -s http://127.0.0.1:9100/health                  # {"status":"ok"} from retail-mcp
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000   # 200 from web
```

If any of these fail, fix that first — testing `/api/chat` on top of a broken
dependency just produces a confusing 502.

### 4.3 Call your own `/api/chat` route directly

```bash
curl -N -X POST http://127.0.0.1:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{"message":"What was our total revenue in February 2026, broken down by channel?","sessionId":"dev-test-session-1"}'
```

Notes on this exact request:
- `-N` disables curl's output buffering — required to see the streamed
  plain-text reply arrive incrementally rather than all at once at the end.
- `x-tenant-id` is optional — omit it and `web` falls back to
  `DEFAULT_TENANT_ID` (`demo` by default in `docker-compose.yml`). Set it
  explicitly when testing a non-default tenant (e.g. one seeded with
  `make seed tenant=acme`).
- `sessionId` must match `/^[A-Za-z0-9-]{8,64}$/` (`route.ts`'s own
  validation) — a too-short or invalid one gets a `400` before anything else
  runs.
- Response is `Content-Type: text/plain`, not JSON — the reply text itself,
  streamed, with no envelope.

Same request in Postman: `POST http://127.0.0.1:3000/api/chat`, header
`x-tenant-id: demo`, JSON body `{"message": "...", "sessionId": "..."}`.
Postman streams the response body live if you're on a recent version; if not,
you'll just see the full text once the request completes.

### 4.4 Example questions exercising each tool

Same request shape as §4.3 (`curl -N -X POST .../api/chat -H "x-tenant-id:
demo" -d '{"message": "...", "sessionId": "..."}'`), only the `message`
changes. These are real prompts verified against the seeded `demo` tenant
during development — use them to confirm a specific tool works through your
BFF, not just that *some* tool does. Full tool reference: `MCP_TOOLS.md`.

| Tool | Example `message` |
|---|---|
| `get_sales_timeseries` (margin) | `"What was our gross margin percentage in February 2026?"` |
| `get_inventory_status` | `"List our 5 lowest-stock SKUs right now."` |
| `get_supplier_performance` | `"Which suppliers have the worst delivery delays?"` |
| `get_accounts_status` | `"Do we have any overdue supplier bills right now?"` |
| `get_business_health_summary` | `"How are we doing overall in February 2026? What needs my attention?"` |
| `get_stockout_root_causes` | `"Why are we out of stock on some items right now? Is it our suppliers?"` |
| `compare_periods` | `"How did revenue in February 2026 compare to January 2026, broken down by channel?"` |
| `get_attention_items` | `"Give me a quick automated scan — what crosses a threshold right now?"` |

The model picks which tool(s) to call from the question's phrasing and
`AGENTS.md`'s instructions — these prompts aren't magic strings that force a
specific tool, just phrasing known to reliably trigger the one listed. If a
prompt doesn't behave as expected, that's itself useful signal — check
`docker compose logs openclaw` for which tool it actually called.

Remember the seeded `demo` tenant's calendar is fixed at **2025-09-01 to
2026-02-28** — questions about "this month" or "last 30 days" relative to
today's real date will come back empty. Use explicit dates/months (like the
examples above) when testing against this dataset.

### 4.5 Or just use the browser

`http://127.0.0.1:3000` — the actual chat UI, exercising the identical code
path. Fastest sanity check, but curl/Postman is what you want for repeatable
testing and for checking headers/status codes.

### 4.6 Reading failures

| Symptom | Meaning | Where to look |
|---|---|---|
| `400 { "error": "message is required..." }` or `"invalid sessionId"` | Your request body didn't pass `route.ts`'s own validation | Fix the request, not the server |
| `404 { "error": "unknown tenant" }` | `x-tenant-id` (or `DEFAULT_TENANT_ID`) doesn't have an active row in `shared.tenants` | Provision/seed that tenant (§4.1 step 3) |
| `502 { "error": "tenant lookup unavailable" }` | `web` couldn't reach Postgres at all for tenant resolution | `docker compose logs web`, check `db` is healthy |
| `502 { "error": "agent unavailable" }` | The call to OpenClaw itself failed (bad token, OpenClaw down, network) | `docker compose logs openclaw`, re-check `OPENCLAW_TOKEN` matches between `web` and `openclaw` services in `docker-compose.yml` |
| `200`, but empty/short body | OpenClaw responded but the agent had nothing to say (e.g. genuinely empty query result) — not necessarily a bug | `docker compose logs openclaw` for the reasoning, `docker compose logs retail-mcp` for the actual SQL error if any |
| Hangs indefinitely | Usually `retail-mcp` or OpenRouter not responding | Check `docker compose ps` for unhealthy containers, and that `OPENROUTER_API_KEY` is valid |

**Isolating which layer is actually broken:** if §4.3 fails but the §5.1 test
below (same message, direct to OpenClaw, no `web` involved) succeeds, the bug
is in your BFF code (`route.ts`, `openclaw.ts`, or `tenant.ts`) — not in
OpenClaw or `retail-mcp`. If §5.1 also fails, the problem is downstream of
`web` and this isn't a BFF bug at all.

---

## 5. Testing each hop independently

### 5.1 Hop 2 alone (skip `web` and the browser entirely)

Everything `web` does before calling OpenClaw is resolve `tenant_id` and build
a system message — reproduce that by hand:

```bash
curl -s -X POST http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer sage-dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openclaw/default",
    "user": "web:demo:test-session-1",
    "stream": false,
    "messages": [
      { "role": "system", "content": "You are assisting tenant \"demo\". Enabled modules: retail. When calling a tenant-scoped tool, always pass tenant_id=\"demo\" exactly." },
      { "role": "user", "content": "What was our total revenue in February 2026, broken down by channel?" }
    ]
  }'
```

(`sage-dev-token` is docker-compose's fallback for an unset `OPENCLAW_TOKEN` in
`.env`. `demo` only resolves if it's been provisioned/seeded — see the
README's `make seed` / `sage-simulate generate --tenant demo`. The demo
dataset's own calendar is a fixed synthetic window, not "recent" relative to
today — check `MIN(date)`/`MAX(date)` on `fact_order_line` if a query comes
back suspiciously empty.)

Works equally well in Postman: same URL, same header, same JSON body.

### 5.2 The MCP hop alone (skip OpenClaw too)

```bash
curl -s http://127.0.0.1:9100/health
docker compose exec openclaw node openclaw.mjs mcp probe   # confirms OpenClaw sees retail-mcp's tools
```

There's no supported way to call `describe_schema`/`get_sales_timeseries`
directly over plain HTTP — they're only reachable via the MCP protocol, which
is what `mcp probe` (and OpenClaw itself) speaks.

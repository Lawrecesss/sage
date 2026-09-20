# API-Level Data Flow: web ↔ OpenClaw ↔ retail-mcp

How a chat message actually travels through the stack, at the HTTP/API level —
what calls what, over which endpoint, with which payload. Companion to
[`ARCHITECTURE.md`](./ARCHITECTURE.md) (the tenancy/scaling model) and the
README's "Agent flow" section (the short version); this is the detailed one.

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

When the LLM decides it needs data, OpenClaw's runtime calls one of two tools
exposed by `mcp/src/retail_mcp/server.py`:

- `describe_schema(tenant_id)` — introspects the tenant's live Postgres schema
- `get_sales_timeseries(tenant_id, metric, group_by?, start_date?, end_date?)` —
  the one analysis tool; `metric`/`group_by` validated against a fixed
  allowlist before any SQL is built

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

## 4. Testing each hop independently

### Hop 2 alone (skip `web` and the browser entirely)

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

### The MCP hop alone (skip OpenClaw too)

```bash
curl -s http://127.0.0.1:9100/health
docker compose exec openclaw node openclaw.mjs mcp probe   # confirms OpenClaw sees retail-mcp's tools
```

There's no supported way to call `describe_schema`/`get_sales_timeseries`
directly over plain HTTP — they're only reachable via the MCP protocol, which
is what `mcp probe` (and OpenClaw itself) speaks.

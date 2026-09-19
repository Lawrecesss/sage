# SAGE — Multi-Tenant Architecture

This document is the reference architecture for Sage's multi-tenant scaling
model. Each section notes whether it's **implemented** (buildable/testable
today via `docker compose`) or **future work** (a documented direction, not
yet built — mainly the K8s/EKS scaling stage, which can't be exercised from
this repo's dev stack).

---

## 1. Core Principles

1. **The agent is generic.** OpenClaw's system prompt and reasoning loop
   never encode tenant- or module-specific logic. What varies per request is
   the *toolset* and the *data* the tools return.
2. **Modules determine tools. Tenants determine data.** MCP servers are
   partitioned by business module (retail, F&B, etc.), not by tenant. Every
   tenant with a given module enabled hits the same MCP server for that
   module.
3. **Compute is pooled. Data is siloed.** `web`, OpenClaw, and MCP servers
   are stateless and horizontally scaled as shared replica pools. Tenant
   business data lives in per-tenant Postgres **schemas** (not separate DB
   instances, not shared tables) because tenant schemas are genuinely
   heterogeneous (one tenant's retail columns won't match another's).
4. **Tools are schema-agnostic.** MCP tools discover a tenant's available
   columns/metrics at call time rather than assuming a fixed schema. The
   agent must be able to ask "what data do I have for this tenant" before
   deciding what analysis tool to call next.
5. **Nothing scales by tenant count except tenant schemas.** `web`, OpenClaw,
   and MCP replica counts scale with *request volume*, not with *number of
   tenants*. Only the number of Postgres schemas grows 1:1 with tenants, and
   that is cheap.

---

## 2. System Diagram *(implemented, single-replica dev topology)*

Sage's frontend and the "backend" role in the target design are the **same
Next.js app** (`web/`) — there's no separate backend service. `web`'s API
routes resolve tenant identity and enabled modules, then call OpenClaw.

```
                         ┌─────────────────────────┐
                         │   web (Next.js)           │
                         │   frontend + API routes,   │
                         │   shared codebase,         │
                         │   N replicas, stateless     │
                         │                              │
                         │  - resolves tenant_id        │
                         │    (x-tenant-id header, or    │
                         │    DEFAULT_TENANT_ID)          │
                         │  - looks up enabled modules     │
                         │    from shared.tenant_modules    │
                         │  - attaches both to the OpenClaw   │
                         │    chat-completions request         │
                         │    (system message + `user` field)   │
                         └────────────┬─────────────────────────┘
                                      │ (behind a load balancer once >1 replica)
                                      ▼
                         ┌─────────────────────────┐
                         │   OpenClaw (shared,       │
                         │   vendored image,          │
                         │   N replicas, stateless)     │
                         │                                │
                         │  - one static MCP connection    │
                         │    per module (see §9 open item  │
                         │    on per-request tool scoping)   │
                         │  - passes tenant_id through on      │
                         │    every tool call the LLM makes,    │
                         │    per instructions in the system     │
                         │    message `web` sent it                │
                         └──────┬──────────┬──────────────────────┘
                                │          │
                  ┌─────────────┘          └─────────────┐
                  ▼                                       ▼
      ┌───────────────────────┐               ┌───────────────────────┐
      │  retail-mcp (shared,   │               │  fnb-mcp (future,      │
      │  N replicas)           │               │  not built — no real    │
      │                         │               │  data behind it yet)     │
      │  - Postgres-backed      │               └───────────────────────┘
      │  - describe_schema(     │
      │    tenant_id) discovers │
      │    tables/columns live  │
      │  - all queries scoped   │
      │    by tenant_id →       │
      │    tenant schema        │
      └────────────┬───────────┘
                    ▼
      ┌─────────────────────────────────┐
      │   Postgres Cluster                │
      │                                    │
      │  shared.tenants                     │  ← control plane
      │  shared.tenant_modules                │
      │                                          │
      │  demo.dim_sku, demo.fact_order_line       │  ← per-tenant SCHEMA
      │  acme.dim_sku, acme.fact_order_line         │    (not separate DB)
      │  ...                                          │
      └─────────────────────────────────────────────┘
```

---

## 3. Tenancy Model *(implemented)*

### 3.1 Shared (control-plane) schema — `shared`

- `shared.tenants` (tenant_id, name, status, created_at)
- `shared.tenant_modules` (tenant_id, module_name, enabled, config_json)
- No `shared.users` table yet — there's no login system in this pass (see
  §9). Adding real auth means adding this table and wiring it to session
  resolution; it's a deliberate gap, not an oversight.

This table set is small, low-write-volume, and fine as normal shared tables.
No isolation concern here — it isn't business data.

### 3.2 Per-tenant schemas — business data

- Each tenant gets a dedicated Postgres **schema** (`demo`, `acme`, ...), not
  a separate database instance.
- Schema contents are module-specific and are allowed to diverge completely
  between tenants, even within the same module.
- Provisioning a tenant = `CREATE SCHEMA` + run that module's baseline table
  setup inside it (`data/simulator/src/sage_simulator/db/provision.py`).
- **One Postgres connection pool per service** (`retail-mcp`, `web`),
  schema-qualified per request via `SET search_path` — not one pool per
  tenant. This is what keeps this viable at scale: connection count scales
  with replica count, not tenant count.

### 3.3 Why not separate DB instances per tenant

Rejected as the default: at scale it means one connection pool, one
migration run, one provisioning step per tenant, multiplied by tenant count.
Reserve physically separate DB instances only for a tenant with a
contractual/regulatory hard-isolation requirement — an exception path, not
the default.

### 3.4 Why not shared tables with a `tenant_id` column

Rejected as the primary model because tenant schemas are not structurally
uniform. Row-level scoping only works when all tenants share one schema
shape; per-tenant schema is the correct answer to *structural*
heterogeneity, which is a different problem than isolation.

---

## 4. Module → MCP Mapping *(implemented for `retail`; pattern only for future modules)*

- One MCP server per **module**, not per tenant. Today: `retail-mcp`
  (`mcp/`), the only module with real data behind it. A future `fnb`
  module would be added the same way — its own MCP service, its own
  `mcp.servers.fnb` entry in `openclaw/openclaw.json` — once it has real
  data to serve. Not scaffolded speculatively.
- Each MCP server scales independently based on load from tenants with that
  module enabled.
- Module identity comes from *which MCP server* a tool lives on (the
  `mcp.servers.<module>` key OpenClaw connects to), not from a naming
  convention inside the tool name itself.
- **Tools are schema-agnostic.** `retail-mcp` exposes:
  - `describe_schema(tenant_id)` — introspects the tenant's actual Postgres
    schema (via `information_schema`/SQLAlchemy `inspect`) and returns the
    real tables/columns present, so the agent can reason about what's
    available before calling an analysis tool.
  - `get_sales_timeseries(tenant_id, metric, group_by=None, start_date=None,
    end_date=None)` — a parameterized analysis tool scoped to the tenant's
    schema. `metric`/`group_by` are validated against an allowlist before
    building SQL — never string-interpolated directly.

---

## 5. Request Flow *(implemented)*

1. Browser calls `POST /api/chat { message, sessionId }` on `web`, with an
   optional `x-tenant-id` header (dev-mode identity — see §9).
2. `web` resolves `tenant_id` (header, or `DEFAULT_TENANT_ID` env fallback)
   and looks up `shared.tenant_modules` for that tenant's enabled modules.
   Unknown/inactive tenant → `404` before OpenClaw is ever called.
3. `web` calls OpenClaw's `/v1/chat/completions`, with:
   - `user: "web:${tenantId}:${sessionId}"` (keeps OpenClaw's per-`user`
     history keying tenant-aware, not just session-aware).
   - A prepended system message stating the tenant_id and enabled modules,
     instructing the model to pass `tenant_id` verbatim on any tenant-scoped
     tool call.
4. The LLM calls `describe_schema` first if it doesn't already have schema
   context for this tenant, then calls analysis tools as needed, always
   including `tenant_id`.
5. `retail-mcp` independently validates `tenant_id` against
   `shared.tenants`/`shared.tenant_modules` before running any query — it
   does not blindly trust the value the LLM supplied (see §9).
6. MCP server returns data → OpenClaw continues reasoning → synthesizes a
   reply → streamed back through `web` to the browser.

---

## 6. Statelessness *(partially implemented — tracked here, not fully solved)*

- **`openclaw_state` volume**: still a single shared volume
  (`/home/node/.openclaw`) for the one OpenClaw instance. It hasn't needed
  to move to Postgres/Redis yet because there's only one replica in this
  dev stack; this becomes a blocking item the moment OpenClaw runs as >1
  replica (see §7, "Scaling" row).
- **Gateway auth**: still a single shared `OPENCLAW_GATEWAY_TOKEN` (unchanged
  in this pass — see §9). Tenant identity now flows through the request
  payload (system message + `user` field), but the gateway token itself
  still grants blanket operator access, not scoped per tenant.
- **Session/conversation state**: unchanged — still keyed by OpenClaw's own
  `user` field, still in-process to the single instance. Not yet an issue at
  one replica; becomes one at N replicas.

---

## 7. Infra Evolution Path

| Stage | What changes | Status |
|---|---|---|
| Now (docker-compose) | Schema-per-tenant + tenant_id threading (web → OpenClaw → retail-mcp → Postgres). Single instance per service, single `sage` DB with `shared` + per-tenant schemas. | **Done** |
| Early growth | Move `openclaw_state` tenant data out of local volume into Postgres/Redis. Harden gateway auth beyond one shared token. | Not started |
| Scaling | Move to EKS. Each service becomes a Deployment with N replicas + a Service. Add ALB/NLB in front of `web` and OpenClaw. | Future work — out of scope for this repo's dev stack |
| Per-module scaling | Scale each MCP server's replica count independently based on its own load. | Future work |
| Enterprise exception path | For a tenant requiring hard DB isolation contractually, provision a fully separate DB instance for that tenant only. | Future work |

---

## 8. Explicit Non-Goals

- No per-tenant app server deployments.
- No per-tenant OpenClaw or MCP server instances.
- No one-MCP-server-per-tenant pattern.
- No baking module- or tenant-specific logic into OpenClaw's system prompt.
- No fixed-column MCP tools that assume a specific tenant's schema shape.

---

## 9. Open Items

- **OpenClaw is a vendored image** (`ghcr.io/openclaw/openclaw`), configured
  only via `openclaw/openclaw.json` — we don't control its source. Its MCP
  client config is static (one connection per module, shared by every
  request), and there's no confirmed native way to have OpenClaw inject
  `tenant_id` into a tool call out-of-band. The current approach — a system
  message telling the model to pass `tenant_id` verbatim, with `retail-mcp`
  independently validating that value against `shared.tenants` — is
  correct-by-default for a cooperative single-session agent, but **not** a
  hard security boundary against a fully adversarial prompt-injected LLM. A
  thin proxy in front of OpenClaw (or native per-request context injection,
  if OpenClaw adds it) is the real fix, and is not built here.
- **No real auth.** Tenant identity in dev is an `x-tenant-id` header or a
  `DEFAULT_TENANT_ID` fallback — trivially spoofable. Production needs real
  login (JWT/session → `tenant_id`) and a `shared.users` table; neither
  exists yet.
- **Single shared `OPENCLAW_GATEWAY_TOKEN`** still grants full operator
  access for the whole deployment; not scoped per tenant.
- Decide session/conversation state storage (Postgres table vs Redis) for
  OpenClaw once state needs to move out of the local volume (multi-replica).
- Define the schema provisioning process for new tenants beyond the
  simulator's `provision_tenant()` (manual today; needs a real pipeline
  triggered on tenant signup for production).

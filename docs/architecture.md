# Architecture

## Data flow

```
┌─ Connector simulators (3) ──── sales · inventory · accounting
│   generate 12 months of correlated history, once, frozen
│     ↓
├─ Ingestion: sage-generate → Parquet on disk (./var/data)
│     ↓
├─ Transform: SQL models → Postgres star schema (facts + dims)
│     ↓
├─ ★ METRIC LAYER (YAML) ── ~20-25 governed metrics, each with SQL,
│     grain, unit, owner, thresholds, direction
│     ↓
├─ ★ DETECTORS (deterministic Python/SQL) ── rolling z-score,
│     week-over-week change, threshold breach → writes `signals` table
│     ↓
├─ ★ MCP SERVER (`agent/mcp`) ── the governed tool surface: list_metrics ·
│     query_metric · compare_period · get_signals · trace_lineage · save_brief
│     ↓ MCP (streamable HTTP, internal network only)
├─ ★ OPENCLAW (self-hosted agent gateway, one model — Claude Sonnet 4.5)
│   ├─ `sage-briefing` agent → triage + correlate + rank by $-impact + write the
│   │                          morning brief, in Mei's language, via `save_brief`
│   ├─ `sage-ask` agent      → conversational drill-down (same MCP tools)
│   └─ daily automation (OpenClaw's built-in cron) wakes `sage-briefing`
│     ↑ HTTP (/v1/chat/completions, SSE), internal network only
├─ API: FastAPI (uvicorn container); the only public entry point. Calls OpenClaw,
│   never an LLM directly. `POST /brief/run` enqueues an `agent_runs` row and
│   drives the OpenClaw call from a background task; `POST /ask` proxies the SSE
│   stream straight through.
│     ↓
└─ Delivery: Next.js web app, behind Caddy on one host. (Telegram push via
    `platform/notifier` exists but is currently unwired — see
    `decisions/0003-openclaw-agent-runtime.md`.)
```

Stretch (only if a sprint finishes early): 4th/5th source (customer support,
operations), a dedicated Action agent + approval queue, per-domain tuned watchers,
extra detector types (STL residual, run-length, ratio drift).

## Component responsibilities

| Component | Package | Responsibility |
| --- | --- | --- |
| Connector simulators | `data/generator/simulators` | Emit Shopify-/WMS-/Xero-shaped payloads over 12 months of correlated history |
| Incident library | `data/generator/incidents` | ~20 planted incidents = the eval ground truth |
| Ingestion + transform | `data/warehouse` | Parquet (on disk) → staging → fact/dim star schema |
| Metric layer | `data/warehouse/metrics` | Governed YAML catalog; `query_metric` / `list_metrics` / `trace_lineage` |
| Detectors | `data/detectors` | z-score / WoW / threshold → `signals` table + `$`-impact estimate + ranking |
| MCP server | `agent/mcp` | The governed tool surface, served over MCP to OpenClaw; `save_brief` validates + persists the brief |
| Agent runtime | `agent/openclaw/` | OpenClaw config template, agent prompts (`sage-briefing`, `sage-ask`), the daily automation |
| Eval harness | `agent/evals` | Replay frozen dataset → drive the OpenClaw briefing agent → score recall / correlation / impact-error / lead-time / precision |
| Notifier | `platform/notifier` | Telegram push — currently unwired, see ADR 0003 |
| Web app + API | `web` | Morning Brief · Signals list · Ask chat · Connections visual; the backend (Next.js API routes, the only public entry point; `POST /brief/run` enqueues an `agent_runs` row and calls OpenClaw) lands here too — see docs/team-plan.md |
| Infra | `platform/infra` | Lightsail deploy kit: `cloud-init.yaml` · `docker-compose.prod.yml` · `Caddyfile` · `provision.sh` |

## Contracts (freeze these in week 1)

- **Tool JSON schemas** — M1 ↔ M2. See [`contracts/tool-schemas.md`](contracts/tool-schemas.md).
- **Brief-JSON** — M2 ↔ M3. See [`contracts/brief-json.md`](contracts/brief-json.md).
- **API shapes** — M2 ↔ M3, mirrored in the backend's response schemas (Next.js,
  `web`) and `web/src/lib/types.ts`.

Everyone codes against stubs until the real thing lands.

## Deployment — one Lightsail instance

The team's AWS access is **Lightsail only**. Everything runs on a single instance
(Ubuntu, ~4 GB, ~$24/mo — budget for a bump to `large_3_0` if six containers are
tight) via `docker-compose`, provisioned by `platform/infra/cloud-init.yaml`.
See [`decisions/0002-lightsail-single-instance.md`](decisions/0002-lightsail-single-instance.md)
and [`decisions/0003-openclaw-agent-runtime.md`](decisions/0003-openclaw-agent-runtime.md).

| Concern | Choice | Note |
| --- | --- | --- |
| Compute | 1 Lightsail instance, `docker compose -f docker-compose.yml -f platform/infra/docker-compose.prod.yml up -d` | local == prod |
| Services | `db` · `mcp` · `openclaw` · `web` · `caddy` | one box, five containers (no separate `api` — see below) |
| Agent runtime | **OpenClaw** (self-hosted agent gateway) | agent definitions live in `agent/openclaw/`, not Python |
| Tool surface | **MCP server** (`agent/mcp`, `sage_mcp`) | the only way OpenClaw touches Sage data; internal network only |
| LLM (OpenClaw's model provider) | Organisers' **Ollama-compatible endpoint, Bedrock-backed** | configured under `models.providers.*` in `agent/openclaw/openclaw.json5` |
| Database | `pgvector/pgvector:pg16` container | data on the instance disk; not exposed |
| Object store | Parquet on the instance disk (`./var/data`) | frozen dataset is a few hundred MB — no bucket needed |
| Scheduling | **OpenClaw automation** (built-in cron) wakes `sage-briefing` directly | no host crontab, no `worker` container |
| Async agent runs | `agent_runs` table; the backend drives the OpenClaw call from a background job | no separate worker process, no SQS |
| API + frontend | Next.js (`web` container, `output: "standalone"`), the only public entry point | the backend lands as API routes inside this same app — see docs/team-plan.md; behind Caddy |
| TLS / routing | Caddy 2 (`platform/infra/Caddyfile`) | automatic Let's Encrypt; `mcp`/`openclaw` are never routed |
| Auth | Hardcoded demo user | no login for the demo |
| Provisioning | `platform/infra/cloud-init.yaml` + `platform/infra/provision.sh` (`aws lightsail` CLI) | |
| Notifications | Telegram Bot API via `platform/notifier` | currently unwired — see ADR 0003 |

**Cost:** flat ~$24–48/mo for the instance. LLM inference runs on the **organisers'
Bedrock bill** — there's no per-token cost to us, but watch for rate limiting /
throttling, and keep runs reproducible against the frozen dataset.

## Agents — via OpenClaw, one model via the organisers' proxy

One model for **every** agent: **Claude Sonnet 4.5** (`LLM_MODEL`; exact string as
the endpoint lists it). No Opus, no Haiku — the per-tier scheme is gone. OpenClaw's
model provider config points at the organisers' endpoint; agent definitions
(system prompt, model, MCP tool profile) live in `agent/openclaw/openclaw.json5` and
`agent/openclaw/prompts/*.md`, not in Python.

| Agent (OpenClaw `agents.entries`) | Model | Notes |
| --- | --- | --- |
| `sage-briefing` | Claude Sonnet 4.5 | triage → cross-domain correlation → $-impact ranking → `save_brief`. **The product.** |
| `sage-ask` | Claude Sonnet 4.5 | conversational drill-down, same MCP tools, metric-cited |

**The briefing agent is still the product** — but it can't buy reasoning quality
with a bigger model. That quality comes from: a tight system prompt, a **strict
output schema enforced at the `save_brief` tool boundary**, good tools, and
letting it take several tool-use turns (decompose → gather → synthesise).

### Constraints — design around these from day one

- **Every tool is an MCP tool**, served by `agent/mcp` over streamable HTTP,
  reachable only on the internal docker network. OpenClaw has no other way to
  touch Sage data — no shell, no filesystem, no browser tool profile.
- **No explicit prompt caching** (`cache_control` breakpoints) or effort/thinking
  control through the Ollama protocol — don't design around them. Keep prompts lean.
- **Structured outputs happen at the tool boundary** — `save_brief` validates
  against `sage_shared.types.MorningBrief`, not a `format=` hint hoped for from the
  model.
- Confirm on day 1 whether the endpoint is native Ollama (`/api/chat`) or
  OpenAI-shaped (`/v1`) and that OpenClaw's `models.providers.*` can register it —
  this is the one real unknown in the swap (see ADR 0003).

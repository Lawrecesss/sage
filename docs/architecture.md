# Architecture

## Data flow

```
┌─ Connector simulators (3) ──── sales · inventory · accounting
│   generate 12 months of correlated history, once, frozen
│     ↓
├─ Ingestion: sage-generate → Parquet on disk (./data)
│     ↓
├─ Transform: SQL models → Postgres star schema (facts + dims)
│     ↓
├─ ★ METRIC LAYER (YAML) ── ~20-25 governed metrics, each with SQL,
│     grain, unit, owner, thresholds, direction
│     ↓
├─ ★ DETECTORS (deterministic Python/SQL) ── rolling z-score,
│     week-over-week change, threshold breach → writes `signals` table
│     ↓
├─ ★ AGENT FLEET (Strands, one model — Claude Sonnet 4.5)
│   ├─ Watcher (parameterised)   → triage + explain signals, run per domain
│   ├─ Correlator / Analyst      → cross-domain causal chains, $-impact
│   │                              ranking, recommended action (as text)
│   ├─ Briefing Agent            → the morning brief, in Mei's language
│   └─ Ask Agent                 → conversational drill-down (same tools)
│     ↓
├─ API: FastAPI (uvicorn container); agent runs async via the `agent_runs` table
│   + a `worker` process; a host cron POSTs /brief/run daily
│     ↓
└─ Delivery: Next.js web app + Telegram bot push, all behind Caddy on one host
```

Stretch (only if a sprint finishes early): 4th/5th source (customer support,
operations), a dedicated Action agent + approval queue, per-domain tuned watchers,
extra detector types (STL residual, run-length, ratio drift).

## Component responsibilities

| Component | Package | Responsibility |
| --- | --- | --- |
| Connector simulators | `packages/generator/simulators` | Emit Shopify-/WMS-/Xero-shaped payloads over 12 months of correlated history |
| Incident library | `packages/generator/incidents` | ~20 planted incidents = the eval ground truth |
| Ingestion + transform | `packages/warehouse` | Parquet (on disk) → staging → fact/dim star schema |
| Metric layer | `packages/warehouse/metrics` | Governed YAML catalog; `query_metric` / `list_metrics` / `trace_lineage` |
| Detectors | `packages/detectors` | z-score / WoW / threshold → `signals` table + `$`-impact estimate + ranking |
| Agent fleet | `packages/agents` | Strands agents + client-side Python tools + prompts |
| Eval harness | `packages/evals` | Replay frozen dataset → score recall / correlation / impact-error / lead-time / precision |
| API | `packages/api` | REST + SSE (uvicorn); `POST /brief/run` enqueues an `agent_runs` row |
| Worker | `packages/agents` (`sage_agents.runtime`) | Polls `agent_runs`, runs the pipeline, persists the brief |
| Notifier | `packages/notifier` | Telegram push |
| Web app | `apps/web` | Morning Brief · Signals list · Ask chat · Connections visual |
| Infra | `infra` | Lightsail deploy kit: `cloud-init.yaml` · `docker-compose.prod.yml` · `Caddyfile` · `provision.sh` |

## Contracts (freeze these in week 1)

- **Tool JSON schemas** — M1 ↔ M2. See [`contracts/tool-schemas.md`](contracts/tool-schemas.md).
- **Brief-JSON** — M2 ↔ M3. See [`contracts/brief-json.md`](contracts/brief-json.md).
- **API shapes** — M2 ↔ M3, mirrored in `packages/api/src/sage_api/schemas/` and
  `apps/web/src/lib/types.ts`.

Everyone codes against stubs until the real thing lands.

## Deployment — one Lightsail instance

The team's AWS access is **Lightsail only**. Everything runs on a single instance
(Ubuntu, ~4 GB, ~$24/mo) via `docker-compose`, provisioned by `infra/cloud-init.yaml`.
See [`decisions/0002-lightsail-single-instance.md`](decisions/0002-lightsail-single-instance.md).

| Concern | Choice | Note |
| --- | --- | --- |
| Compute | 1 Lightsail instance, `docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml up -d` | local == prod |
| Services | `db` · `api` · `worker` · `web` · `caddy` | one box, five containers |
| Agent framework | Strands Agents SDK (Python) | provider-agnostic |
| LLM | Organisers' **Ollama-compatible endpoint, Bedrock-backed** | `OllamaModel(host=LLM_BASE_URL, headers=Bearer)` |
| Database | `pgvector/pgvector:pg16` container | data on the instance disk; not exposed |
| Object store | Parquet on the instance disk (`./data`) | frozen dataset is a few hundred MB — no bucket needed |
| Scheduling | host `crontab` → `curl -XPOST http://localhost/api/brief/run` | daily |
| Async agent runs | `agent_runs` table + `worker` process (`FOR UPDATE SKIP LOCKED`) | no SQS |
| API | FastAPI on uvicorn, behind Caddy | `/api/*` → api, everything else → web |
| Frontend hosting | `web` container (Next.js `output: "standalone"`) | behind Caddy |
| TLS / routing | Caddy 2 (`infra/Caddyfile`) | automatic Let's Encrypt |
| Auth | Hardcoded demo user | no login for the demo |
| Provisioning | `infra/cloud-init.yaml` + `infra/provision.sh` (`aws lightsail` CLI) | |
| Observability | Strands OpenTelemetry → optional `jaeger` container | agent traces on screen = scoring opportunity |
| Notifications | Telegram Bot API | push to a real phone on stage |

**Cost:** flat ~$24/mo for the instance. LLM inference runs on the **organisers'
Bedrock bill** — there's no per-token cost to us, but watch for rate limiting /
throttling, and keep runs reproducible against the frozen dataset.

## LLM — via the organisers' proxy

One model for **every** agent: **Claude Sonnet 4.5** (`LLM_MODEL`; exact string as
the endpoint's `/api/tags` lists it). No Opus, no Haiku — the per-tier scheme is gone.

| Agent | Model | Notes |
| --- | --- | --- |
| Watcher (×3), Briefing, Ask, Correlator/Analyst | Claude Sonnet 4.5 | same model everywhere |

**The Correlator is still the product** — but it can't buy reasoning quality with a
bigger model. That quality comes from: a tight system prompt, a **strict output
schema** (Strands strict-schema / Ollama `format`), good tools, and letting it take
several tool-use turns (decompose → gather → synthesise).

### Constraints — design around these from day one

- **Every tool is a client-side Python tool** (Strands' model anyway).
- **No explicit prompt caching** (`cache_control` breakpoints) or effort/thinking
  control through the Ollama protocol — don't design around them. Keep prompts lean.
- **Structured outputs work** — use them for the Correlator's causal-chain schema.
- Confirm on day 1 whether the endpoint is native Ollama (`/api/chat`) or OpenAI-shaped
  (`/v1`); if the latter, swap `OllamaModel` → `OpenAIModel` / `LiteLLMModel` (one line).

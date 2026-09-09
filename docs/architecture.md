# Architecture

## Data flow

```
┌─ Connector simulators (3) ──── sales · inventory · accounting
│   emit realistic API payloads on a schedule
│     ↓
├─ Ingestion: EventBridge Scheduler → Lambda → S3 raw (Parquet)
│     ↓
├─ Transform: SQL models → Postgres star schema (facts + dims)
│     ↓
├─ ★ METRIC LAYER (YAML) ── ~20-25 governed metrics, each with SQL,
│     grain, unit, owner, thresholds, direction
│     ↓
├─ ★ DETECTORS (deterministic Python/SQL) ── rolling z-score,
│     week-over-week change, threshold breach → writes `signals` table
│     ↓
├─ ★ AGENT FLEET (Strands + Bedrock)
│   ├─ Watcher (parameterised)   → triage + explain signals, run per domain
│   ├─ Correlator / Analyst      → cross-domain causal chains, $-impact
│   │                              ranking, recommended action (as text)
│   ├─ Briefing Agent            → the morning brief, in Mei's language
│   └─ Ask Agent                 → conversational drill-down (same tools)
│     ↓
├─ API: FastAPI on Lambda + API Gateway; agent runs async via SQS
│     ↓
└─ Delivery: Next.js web app (Amplify) + Telegram bot push
```

Stretch (only if a sprint finishes early): 4th/5th source (customer support,
operations), a dedicated Action agent + approval queue, per-domain tuned watchers,
extra detector types (STL residual, run-length, ratio drift).

## Component responsibilities

| Component | Package | Responsibility |
| --- | --- | --- |
| Connector simulators | `packages/generator/simulators` | Emit Shopify-/WMS-/Xero-shaped payloads over 12 months of correlated history |
| Incident library | `packages/generator/incidents` | ~20 planted incidents = the eval ground truth |
| Ingestion + transform | `packages/warehouse` | Raw Parquet → staging → fact/dim star schema |
| Metric layer | `packages/warehouse/metrics` | Governed YAML catalog; `query_metric` / `list_metrics` / `trace_lineage` |
| Detectors | `packages/detectors` | z-score / WoW / threshold → `signals` table + `$`-impact estimate + ranking |
| Agent fleet | `packages/agents` | Strands agents + client-side Python tools + prompts |
| Eval harness | `packages/evals` | Replay frozen dataset → score recall / correlation / impact-error / lead-time / precision |
| API | `packages/api` | REST + SSE; enqueues agent runs to SQS |
| Notifier | `packages/notifier` | Telegram push (primary) / SES |
| Web app | `apps/web` | Morning Brief · Signals list · Ask chat · Connections visual |
| Infra | `infra` | CDK stacks: data / api / agents / frontend |

## Contracts (freeze these in week 1)

- **Tool JSON schemas** — M1 ↔ M2. See [`contracts/tool-schemas.md`](contracts/tool-schemas.md).
- **Brief-JSON** — M2 ↔ M3. See [`contracts/brief-json.md`](contracts/brief-json.md).
- **API shapes** — M2 ↔ M3, mirrored in `packages/api/src/sage_api/schemas/` and
  `apps/web/src/lib/types.ts`.

Everyone codes against stubs until the real thing lands.

## AWS stack & cost notes

| Layer | Choice | Note |
| --- | --- | --- |
| Models | Amazon Bedrock | Prefix model IDs with `anthropic.` |
| Agent framework | Strands Agents SDK 1.0 (Python) | Runs identically local and on AWS |
| Agent hosting | Lambda (SQS-triggered worker) | 15-min ceiling is ample for a briefing run |
| Database | RDS PostgreSQL `db.t4g.micro` + pgvector | ~$12/mo. One database, no sprawl |
| Object store | S3 (Parquet raw zone) | Pennies |
| Analytics engine | DuckDB embedded in Lambda over S3 | Only if Postgres struggles |
| Scheduling | EventBridge Scheduler | Free tier |
| Async agent runs | SQS + Lambda worker | Keeps API responses fast |
| API | FastAPI + Mangum on Lambda + API Gateway | Near-zero idle cost |
| Frontend hosting | AWS Amplify Hosting | Simplest CI-to-URL |
| Auth | Hardcoded demo user | Cognito is stretch |
| IaC | AWS CDK (Python) | One toolchain |
| Observability | Strands OpenTelemetry → CloudWatch | Agent traces on screen = scoring opportunity |
| Notifications | Telegram Bot API (primary) + SES | Push to a real phone on stage |

**🚫 Do not touch** (these destroy the $100 credit): OpenSearch Serverless
(~$700/mo floor — pgvector does everything we need), Aurora provisioned, Redshift,
MSK, SageMaker endpoints, NAT Gateway (~$32/mo — keep Lambdas out of private
subnets or use VPC endpoints), any always-on ECS/Fargate task.

## Bedrock model assignment

| Agent | Model ID | Rationale |
| --- | --- | --- |
| Correlator / Analyst | `anthropic.claude-opus-5` | The hard reasoning. Do not economise — this agent *is* the product. `thinking: {"type": "adaptive"}`, `output_config: {"effort": "high"}` |
| Briefing, Ask | `anthropic.claude-sonnet-5` | Strong writing + tool use at lower cost |
| Watcher (×3 per cycle) | `anthropic.claude-sonnet-5` | `effort: "low"` |
| Bulk tagging (stretch) | `anthropic.claude-haiku-4-5` | Cheap, high-volume |

### Known Bedrock constraints — design around these from day one

No server-side web search, code execution, MCP connector, Managed Agents, Message
Batches or Files API. **Every tool is a client-side Python tool** (Strands' model
anyway). Prompt caching, structured outputs, adaptive thinking, effort control and
tool use all work. **Cache the metric catalog + system prompt behind a
`cache_control` breakpoint** — the single biggest cost lever.

**Region:** develop against `us-west-2` / `us-east-1` (newest model availability).
Check `ap-southeast-1` on day 1; if Singapore has the models, deploy there for
latency + the "data stays in region" governance line. Region is a config value,
not a feature — don't spend more than an hour on it.

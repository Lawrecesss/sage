# Sage

**An agentic monitoring layer for retail / e-commerce SMEs.**

SME owners get business signal from sales, inventory, accounting, customer enquiries
and operations — each in a different system, none talking to each other. The owner
becomes the integration layer. Sage replaces that: a watcher agent runs on a schedule
against a unified metric layer, deterministic detectors surface anomalies, an analyst
agent correlates signals across domains into a causal story ranked by dollar impact
with a recommended action, and a briefing agent delivers a prioritised morning brief
to the owner's phone. The owner can then ask follow-ups in plain language.

> Built for the NUS-ISS **"Show Me Your Agents"** Hackathon 2026 — retail vertical.
>
> **Status: development-ready skeleton.** The toolchain is wired and verified —
> `uv sync` and `pnpm install` resolve against committed lockfiles, `pytest` runs
> green (package-import smoke tests), `ruff` is clean, and the web app builds and
> lints. Every module, tool, agent, router and CDK stack exists with its docstring
> and signature; the logic inside is a stub marked with its owning lane and sprint.
> Each module, tool, agent, router and CDK stack has its file and a docstring
> saying what belongs there and which lane owns it; the logic is left to be
> written. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) and
> [`docs/team-plan.md`](docs/team-plan.md).

## The three ideas that make this win

1. **A metric layer, not text-to-SQL.** Agents never write SQL. They call
   `query_metric(metric_id, dimensions, period)` against a governed YAML catalog
   ([`packages/warehouse/.../metrics/metrics.yaml`](packages/warehouse/src/sage_warehouse/metrics/metrics.yaml)).
   Every number in a brief is traceable to a metric definition.
2. **Detection is deterministic; explanation is the LLM.** Statistics find anomalies
   ([`packages/detectors`](packages/detectors)); the LLM interprets, correlates,
   prioritises, communicates. Reproducible run-to-run, ~80% cheaper in tokens.
3. **Cross-source correlation is the product.** Only a system reading sales,
   inventory and accounting together can say: *"Supplier SG-Textiles slipped 6 days
   on PO-4471 → 'Linen Throw' stocked out Tue → category revenue fell S$4,200 and
   gross margin dropped 2pts as you backfilled with a pricier substitute → S$3,100
   is still recoverable if PO-4471 is expedited (S$180 rush fee)."*

## Demo persona (never deviate)

**"Lian & Co."** — a Singapore homeware retailer. 1 outlet + Shopify + Lazada/Shopee.
~1,200 SKUs, 6 staff, ~S$180k monthly revenue. Owner **Mei** spends ~45 min every
morning across five tabs. One persona, one story.

## Architecture

```
Connector simulators (3: sales · inventory · accounting)
  → Ingestion (EventBridge → Lambda → S3 raw Parquet)
  → Transform (SQL models → Postgres star schema)
  → ★ Metric layer (YAML, ~20-25 governed metrics)
  → ★ Detectors (deterministic: z-score, WoW change, threshold → signals table)
  → ★ Agent fleet (Strands + Bedrock): Watcher · Analyst/Correlator · Briefing · Ask
  → API (FastAPI on Lambda + API Gateway; agent runs async via SQS)
  → Delivery (Next.js web app on Amplify + Telegram bot push)
```

Full detail: [`docs/architecture.md`](docs/architecture.md).

## Repo layout

| Path | What |
| --- | --- |
| `packages/generator` | Synthetic SME dataset + planted incident library (the eval ground truth) |
| `packages/warehouse` | Star schema, SQL transforms, **governed metric layer** |
| `packages/detectors` | Deterministic anomaly detection — no LLM |
| `packages/agents` | Strands agents, tool surface, prompts, Bedrock integration |
| `packages/evals` | Agent eval harness — the headline number |
| `packages/api` | FastAPI service (Mangum on Lambda) |
| `packages/notifier` | Telegram bot / SES delivery |
| `packages/shared` | Cross-package types, settings, constants |
| `apps/web` | Next.js 15 web app (Morning Brief · Signals · Ask · Connections) |
| `infra` | AWS CDK (Python) — data / api / agents / frontend stacks |
| `docs` | Architecture, demo script, pitch, contracts, plans |

## Stack

- **Frontend** — Next.js 15 (App Router) · TypeScript · Tailwind · shadcn/ui · Recharts · SSE
- **Backend** — Python 3.12 · FastAPI · SQLAlchemy · Pydantic · `uv`
- **Data** — Polars (generator) · SQL models (transforms) · statsmodels / scipy (detectors)
- **Agents** — Strands Agents SDK 1.0 + Amazon Bedrock (`anthropic.*` model IDs)
- **Infra** — Lambda · API Gateway · RDS Postgres (`db.t4g.micro` + pgvector) · S3 · EventBridge · SQS · Amplify
- **Repo** — one monorepo, `pnpm` + `uv` workspaces, GitHub Actions → Amplify + CDK

## Getting started

```bash
./scripts/bootstrap.sh     # uv sync, pnpm install, start Postgres, create .env files
uv run pytest              # smoke tests — green
pnpm --filter web build    # web app — builds

# once the relevant stubs are filled in (see docs/team-plan.md):
./scripts/seed-demo.sh     # generate dataset, load warehouse, run detectors
./scripts/dev.sh           # API (:8000) + web app (:3000)
```

Full command list: [`CONTRIBUTING.md`](CONTRIBUTING.md). AWS deploy and the demo
checklist: [`docs/runbook.md`](docs/runbook.md).

## Timeline

Build Sep 8 → Sep 28 (3 sprints). Hard code freeze Sep 28 (`git tag demo-freeze`).
Sep 29 → Oct 10: hardening, deck, demo video, ≥5 dry runs — no new features.
Committed vs. stretch scope: [`docs/team-plan.md`](docs/team-plan.md).

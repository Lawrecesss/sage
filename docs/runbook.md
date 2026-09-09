# Runbook

> Status: **STUB** — fill in as infra lands (M4, Sprint 1–2).

## Local development

```bash
./scripts/bootstrap.sh   # uv sync --all-packages; pnpm install; docker compose up -d db
./scripts/seed-demo.sh   # sage-generate → sage-warehouse load → sage-detectors run
./scripts/dev.sh         # uvicorn sage_api.main:app --reload  &  pnpm --filter web dev
```

Local Postgres (with pgvector) comes from `docker-compose.yml` on `localhost:5432`.

## Environment variables

Copy `.env.example` → `.env` and `apps/web/.env.local.example` → `apps/web/.env.local`.
Never commit real secrets. Key vars:

| Var | Used by | Note |
| --- | --- | --- |
| `DATABASE_URL` | warehouse, detectors, api | `postgresql+psycopg://sage:sage@localhost:5432/sage` locally |
| `AWS_REGION` | agents, api, infra | `us-west-2` for dev; check `ap-southeast-1` day 1 |
| `BEDROCK_MODEL_ANALYST` | agents | `anthropic.claude-opus-5` |
| `BEDROCK_MODEL_DEFAULT` | agents | `anthropic.claude-sonnet-5` |
| `AGENT_QUEUE_URL` | api, agents | SQS queue for async agent runs |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | notifier | demo phone |
| `SAGE_DATASET_SNAPSHOT` | evals | path/version of the frozen dataset |

## AWS deploy (CDK)

```bash
cd infra
uv run cdk bootstrap       # once per account/region
uv run cdk deploy --all
```

Stacks: `data` (RDS, S3, EventBridge) → `agents` (worker Lambda, Bedrock IAM,
OTel) → `api` (API Gateway, Lambda, SQS) → `frontend` (Amplify).

### Day 1

- Request **Bedrock model access** (approval can take days).
- Set **budget alarms** at $25 / $50 / $75.
- `cdk deploy` an empty skeleton to prove the pipeline.

## Demo-day checklist

- [ ] Frozen dataset loaded in the demo environment
- [ ] Demo account warmed up (run the loop once beforehand)
- [ ] Telegram bot delivering to the on-stage phone
- [ ] Backup recording on a local drive
- [ ] Credit balance healthy (< $50 consumed)
- [ ] `git tag demo-freeze` is what's deployed

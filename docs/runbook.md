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
| `DATABASE_URL` | warehouse, detectors, api, worker | `postgresql+psycopg://sage:sage@localhost:5432/sage` locally; `@db:5432` in compose |
| `POSTGRES_PASSWORD` | docker-compose | `sage` locally; a real secret in prod |
| `LLM_BASE_URL` | agents, worker | organisers' Ollama-compatible endpoint (Bedrock-backed) |
| `LLM_API_KEY` | agents, worker | bearer token for that endpoint |
| `LLM_MODEL` | agents, worker | `claude-sonnet-4-5` — the only allowed model |
| `SAGE_DOMAIN` | caddy, api (CORS) | public hostname |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | notifier | demo phone |
| `SAGE_DATASET_SNAPSHOT` | evals | path/version of the frozen dataset |

## Deploy to Lightsail

One instance, `docker-compose`. Full detail in [`../infra/README.md`](../infra/README.md).

```bash
# from your laptop (needs the `aws` CLI + Lightsail permissions + a registered SSH key)
bash infra/provision.sh create      # instance + static IP + firewall (22/80/443)
# → point your DNS A record at the static IP it prints
bash infra/provision.sh setup       # ssh in, install Docker, clone, first `compose up --build`

# on the instance: put real secrets in /opt/sage/.env
#   POSTGRES_PASSWORD  SAGE_DOMAIN  LLM_BASE_URL  LLM_API_KEY  LLM_MODEL  TELEGRAM_*
bash infra/provision.sh restart

# load the frozen dataset (once M1's generator lands)
ssh ubuntu@<ip> 'cd /opt/sage && docker compose ... exec api sage-warehouse init-db && ./scripts/seed-demo.sh'
```

Redeploy: `bash infra/provision.sh restart`, or the manual `Deploy` GitHub workflow.

### Day 1

- Get `LLM_BASE_URL` + `LLM_API_KEY` from the organisers; confirm the model string
  and whether the endpoint is native-Ollama or OpenAI-shaped.
- Create the Lightsail instance + static IP; point DNS.
- Bring `api` + `caddy` up so `https://$SAGE_DOMAIN/api/health` answers (unblocks M3).

## Demo-day checklist

- [ ] Frozen dataset loaded on the instance
- [ ] Instance warmed up (run the loop once beforehand)
- [ ] Telegram bot delivering to the on-stage phone
- [ ] Backup recording on a local drive
- [ ] `git tag demo-freeze` is what's deployed (`provision.sh restart` from the tag)

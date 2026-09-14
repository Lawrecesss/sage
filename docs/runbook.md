# Runbook

> Status: **STUB** — fill in as infra lands (M4, Sprint 1–2).

## Local development

```bash
./scripts/bootstrap.sh   # uv sync --all-packages; pnpm install; docker compose up -d db
./scripts/seed-demo.sh   # sage-generate → sage-warehouse load → sage-detectors run
./scripts/dev.sh         # sage-mcp  &  uvicorn sage_api.main:app --reload  &  pnpm --filter web dev
make agent-up            # optional: mcp + openclaw in docker, for the full agent loop
```

Local Postgres (with pgvector) comes from `docker-compose.yml` on `localhost:5432`.

## Environment variables

Copy `.env.example` → `.env` and `apps/web/.env.local.example` → `apps/web/.env.local`.
Never commit real secrets. Key vars:

| Var | Used by | Note |
| --- | --- | --- |
| `DATABASE_URL` | warehouse, detectors, api, mcp | `postgresql+psycopg://sage:sage@localhost:5432/sage` locally; `@db:5432` in compose |
| `POSTGRES_PASSWORD` | docker-compose | `sage` locally; a real secret in prod |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | openclaw (container) | organisers' Ollama-compatible endpoint; OpenClaw's model provider — not read by any Python process |
| `OPENCLAW_BASE_URL` / `OPENCLAW_TOKEN` | api, evals | internal gateway URL + full-operator bearer token |
| `OPENCLAW_AGENT_BRIEFING` / `OPENCLAW_AGENT_ASK` | api | agent ids OpenClaw exposes |
| `MCP_URL` | openclaw (container) | where OpenClaw finds the `sage` MCP server |
| `SAGE_DOMAIN` | caddy, api (CORS) | public hostname |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | notifier | currently unwired — see ADR 0003 |
| `SAGE_DATASET_SNAPSHOT` | evals | path/version of the frozen dataset |

## Deploy to Lightsail

One instance, `docker-compose`. Full detail in [`../infra/README.md`](../infra/README.md).

```bash
# from your laptop (needs the `aws` CLI + Lightsail permissions + a registered SSH key)
bash infra/provision.sh create      # instance + static IP + firewall (22/80/443)
# → point your DNS A record at the static IP it prints
bash infra/provision.sh setup       # ssh in, install Docker, clone, first `compose up --build`

# on the instance: put real secrets in /opt/sage/.env
#   POSTGRES_PASSWORD  SAGE_DOMAIN  LLM_BASE_URL  LLM_API_KEY  LLM_MODEL
#   OPENCLAW_TOKEN  TELEGRAM_*
bash infra/provision.sh restart

# register the daily automation once — see openclaw/automations/daily-brief.md
ssh ubuntu@<ip> 'cd /opt/sage && docker compose exec openclaw openclaw automations create ...'

# load the frozen dataset (once M1's generator lands)
ssh ubuntu@<ip> 'cd /opt/sage && docker compose ... exec api sage-warehouse init-db && ./scripts/seed-demo.sh'
```

Redeploy: `bash infra/provision.sh restart`, or the manual `Deploy` GitHub workflow.

### Day 1

- Get `LLM_BASE_URL` + `LLM_API_KEY` from the organisers; confirm the model string
  and whether the endpoint is native-Ollama or OpenAI-shaped.
- **Spike:** confirm that endpoint registers under OpenClaw's `models.providers`
  — see docs/decisions/0003-openclaw-agent-runtime.md. This blocks every M2 sprint.
- Create the Lightsail instance + static IP; point DNS.
- Bring `api` + `caddy` up so `https://$SAGE_DOMAIN/api/health` answers (unblocks M3).

## Demo-day checklist

- [ ] Frozen dataset loaded on the instance
- [ ] Instance warmed up (run the loop once beforehand)
- [ ] Daily automation registered in OpenClaw and has fired at least once
- [ ] Backup recording on a local drive
- [ ] `git tag demo-freeze` is what's deployed (`provision.sh restart` from the tag)

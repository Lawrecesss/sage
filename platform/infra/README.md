# platform/infra — Lightsail single-instance deploy

Owned by **M4**. Sage runs on **one AWS Lightsail instance** (Ubuntu, ~4 GB, ~$24/mo).
No Lambda, API Gateway, SQS, EventBridge, RDS or Amplify — the team's AWS access is
Lightsail only. See [`../../docs/decisions/0002-lightsail-single-instance.md`](../../docs/decisions/0002-lightsail-single-instance.md).

```
DNS A record → Lightsail static IP → the instance
  docker compose --profile agent -f docker-compose.yml -f platform/infra/docker-compose.prod.yml up -d
  ├─ db        pgvector/pgvector:pg16   (data on an attached block-storage volume)
  ├─ mcp       sage-mcp — the governed tool surface, MCP over streamable HTTP
  ├─ openclaw  agent gateway; config seeded from ./agent/openclaw (prompts, agents, cron)
  ├─ api       uvicorn sage_api.main:app — the only public entry point
  ├─ web       next start (standalone build)
  └─ caddy     :80/:443 — TLS + reverse proxy ({$SAGE_DOMAIN} → web, /api/* → api)

  `mcp` and `openclaw` are internal-only — no published ports, not routed by Caddy.

  daily brief → an OpenClaw automation (agent/openclaw/automations/daily-brief.md),
  not a host crontab. Register it once after first deploy.
```

See [`../../docs/decisions/0003-openclaw-agent-runtime.md`](../../docs/decisions/0003-openclaw-agent-runtime.md)
for why the `worker` container and host cron are gone.

## Files

| File | What |
| --- | --- |
| `cloud-init.yaml` | User-data for a fresh instance: installs Docker, clones the repo, writes `.env`, brings the stack up |
| `docker-compose.prod.yml` | Override layered on the repo-root `docker-compose.yml` — adds `api`, `web`, `caddy` (`mcp` + `openclaw` come from the base file's `agent` profile) |
| `Caddyfile` | Reverse proxy + automatic HTTPS |
| `provision.sh` | Create the instance / static IP / firewall via the `aws lightsail` CLI, and re-run setup on an existing box |

## First deploy

```bash
# 1. from your laptop — create the box (needs `aws` CLI + Lightsail permissions)
bash platform/infra/provision.sh create

# 2. point your DNS A record at the static IP it prints, then:
bash platform/infra/provision.sh setup      # ssh in, install docker, clone, compose up

# 3. put real secrets in /opt/sage/.env on the instance:
#    LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, OPENCLAW_TOKEN, TELEGRAM_*,
#    SAGE_DOMAIN, POSTGRES_PASSWORD
bash platform/infra/provision.sh restart

# 4. register the daily-brief automation once the openclaw container is up —
#    see agent/openclaw/automations/daily-brief.md
```

Then load the frozen dataset once M1's generator lands — see [`../../docs/runbook.md`](../../docs/runbook.md).

## Redeploy

`.github/workflows/deploy.yml` (manual trigger) SSHes in and runs
`git pull && docker compose ... up -d --build`. Or `bash platform/infra/provision.sh restart`.

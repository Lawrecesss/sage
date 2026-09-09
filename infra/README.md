# infra — Lightsail single-instance deploy

Owned by **M4**. Sage runs on **one AWS Lightsail instance** (Ubuntu, ~4 GB, ~$24/mo).
No Lambda, API Gateway, SQS, EventBridge, RDS or Amplify — the team's AWS access is
Lightsail only. See [`../docs/decisions/0002-lightsail-single-instance.md`](../docs/decisions/0002-lightsail-single-instance.md).

```
DNS A record → Lightsail static IP → the instance
  docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml up -d
  ├─ db      pgvector/pgvector:pg16   (data on an attached block-storage volume)
  ├─ api     uvicorn sage_api.main:app
  ├─ worker  python -m sage_agents.runtime   (polls the agent_runs table)
  ├─ web     next start (standalone build)
  └─ caddy   :80/:443 — TLS + reverse proxy ({$SAGE_DOMAIN} → web, /api/* → api)

  host crontab → daily: curl -XPOST http://localhost/api/brief/run
```

## Files

| File | What |
| --- | --- |
| `cloud-init.yaml` | User-data for a fresh instance: installs Docker, clones the repo, writes `.env`, brings the stack up |
| `docker-compose.prod.yml` | Override layered on the repo-root `docker-compose.yml` — adds `api`, `worker`, `web`, `caddy` |
| `Caddyfile` | Reverse proxy + automatic HTTPS |
| `provision.sh` | Create the instance / static IP / firewall via the `aws lightsail` CLI, and re-run setup on an existing box |

## First deploy

```bash
# 1. from your laptop — create the box (needs `aws` CLI + Lightsail permissions)
bash infra/provision.sh create

# 2. point your DNS A record at the static IP it prints, then:
bash infra/provision.sh setup      # ssh in, install docker, clone, compose up

# 3. put real secrets in /opt/sage/.env on the instance:
#    LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, TELEGRAM_*, SAGE_DOMAIN, POSTGRES_PASSWORD
bash infra/provision.sh restart
```

Then load the frozen dataset once M1's generator lands — see [`../docs/runbook.md`](../docs/runbook.md).

## Redeploy

`.github/workflows/deploy.yml` (manual trigger) SSHes in and runs
`git pull && docker compose ... up -d --build`. Or `bash infra/provision.sh restart`.

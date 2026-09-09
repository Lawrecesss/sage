# 2. Lightsail single instance; one model via the organisers' endpoint

Date: 2026-09-09 · Status: accepted · Supersedes the infra + model-assignment parts of [0001](0001-record-architecture-decisions.md)

## Context

The original plan was AWS-native serverless: Lambda + API Gateway + SQS +
EventBridge + RDS + Amplify, agents on Amazon Bedrock via the Strands SDK, with a
$100 credit and budget alarms.

Two things changed:

1. **The team's AWS access is now Lightsail only** — no Lambda, API Gateway, SQS,
   EventBridge, Amplify, Bedrock, or CloudWatch.
2. **The LLM is a shared endpoint the hackathon organisers host** — an
   Ollama-compatible API (base URL + API key) that is backed by Bedrock on their
   side. **Only one model is exposed: Claude Sonnet 4.5.**

## Decision

- **One Lightsail instance** (Ubuntu, ~4 GB, ~$24/mo) runs everything via
  `docker-compose` (`db` · `api` · `worker` · `web` · `caddy`), provisioned by
  `infra/cloud-init.yaml`. Local `docker compose up` == prod.
- **Postgres is the `pgvector/pgvector:pg16` container** on that instance; data on
  the instance disk. No managed database, no S3 (Parquet sits on disk).
- **LLM via Strands' Ollama provider** — `OllamaModel(host=LLM_BASE_URL, headers=Bearer)`.
  **One model for every agent: Claude Sonnet 4.5.** The per-tier scheme
  (Analyst→Opus, others→Sonnet, bulk→Haiku) is gone.
- **Async agent runs use an `agent_runs` table** — the API inserts a `queued` row,
  a `worker` process claims it with `FOR UPDATE SKIP LOCKED`. No SQS.
- **Scheduling is a host `crontab`** that POSTs `/api/brief/run` daily. No EventBridge.
- **Caddy** terminates TLS and routes `/api/*` → api, everything else → web. No API
  Gateway, no Amplify.
- **`infra/`** is a deploy kit — `cloud-init.yaml`, `docker-compose.prod.yml`,
  `Caddyfile`, `provision.sh` — not a CDK app. It is no longer a `uv` workspace member.

## Consequences

**Lose:** autoscaling, managed services, Bedrock-native prompt caching /
adaptive-thinking / effort control, and a bigger model for the Correlator. The
Correlator's reliability now has to come from a strict output schema + good tools +
multi-turn tool use, not from Opus.

**Gain:** one box to reason about; `git pull && docker compose up` is the whole
deploy; local and prod are the same stack; no `$100` credit anxiety (LLM runs on
the organisers' bill — watch rate limits instead); no multi-service IAM.

**Pitch:** still AWS (Lightsail), still Bedrock-backed, still Strands. Reframe any
"frontier model does the reasoning" slide — the *architecture* (governed metric
layer, deterministic detection, constrained Correlator) is what makes one mid-tier
model reliable.

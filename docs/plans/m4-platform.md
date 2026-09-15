# M4 — Platform Engineer & Product Lead

> **Update (post-restructure):** the API service will be Next.js, built inside
> `web`, not a separate Python service owned by this lane — see
> docs/team-plan.md. `platform/api` (the FastAPI stub this doc's Sprint 1–2
> tasks describe) has been deleted. The container/compose/CI/deploy-kit
> ownership below still stands; the specific "build the FastAPI app" tasks in
> Sprint 1–2 need re-planning against M3 once the Next.js backend work starts —
> left as-is here rather than rewritten, since that re-plan is a decision for
> M3/M4 to make together, not a mechanical path fix.

## Lane summary

- **Owns:** the Lightsail instance + `docker-compose` deploy, the API service, the
  `mcp` + `openclaw` containers, CI/CD — **and** the pitch, deck, demo script and
  video. (Telegram is on hold — see [`../decisions/0003-openclaw-agent-runtime.md`](../decisions/0003-openclaw-agent-runtime.md) —
  own it if/when that's unblocked, but don't plan a sprint around it.)
- **Backs up:** M3 on API integration.
- **Success test:** `docker compose up` on a fresh Lightsail instance reproduces the
  whole system from clean.
- **You have two jobs.** The platform work is front-loaded; the product work
  (deck, video, dry runs) is the back half. Plan for both from day one.

## Skills this lane wants

Linux + Docker + docker-compose, Caddy, a little Lightsail (or the `aws` CLI), CI/CD
— **and comfort presenting**, since you own the pitch and demo.

## Where your work goes

| Area | Path |
| --- | --- |
| Deploy kit | `platform/infra/cloud-init.yaml`, `platform/infra/docker-compose.prod.yml`, `platform/infra/Caddyfile`, `platform/infra/provision.sh` |
| Container builds | `Dockerfile` (mcp), `web/Dockerfile` (will also carry the backend once it's Next.js) |
| Base compose | `docker-compose.yml` (`db` always-on; `mcp` + `openclaw` behind the `agent` profile) |
| API service | `platform/api/src/sage_api/` — `main.py`, `settings.py`, `deps.py`, `agent.py`, `routers/*`, `schemas/*` |
| Job queue table | `data/warehouse/.../models/schema.sql` (`agent_runs`) — with M1 |
| OpenClaw deploy | `agent/openclaw/openclaw.json5` mount + env wiring in `docker-compose.yml` (contents owned by M2) |
| Telegram | `platform/notifier/src/sage_notifier/{telegram,render}.py` — currently unwired, on hold |
| CI | `.github/workflows/ci.yml`, `deploy.yml` |
| Product docs | `docs/demo-script.md`, `docs/pitch.md`, `docs/runbook.md` |

Run notifier tests: `uv run pytest platform/notifier`.

---

## Sprint 1 · Sep 8–14 — the instance, the containers, and the API M3 needs

- [ ] **🚨 Get the LLM endpoint from the organisers — TODAY.** Blocks every M2 sprint.
      *Done when:* you have `LLM_BASE_URL` + `LLM_API_KEY`, you've confirmed the
      **model string** (Sonnet 4.5) and whether the endpoint is native Ollama
      (`/api/chat`) or OpenAI-shaped (`/v1`), and you've passed all of it to M2 —
      including for their day-1 spike on whether OpenClaw's `models.providers`
      accepts it (see `docs/decisions/0003-openclaw-agent-runtime.md`).

- [ ] **Create the Lightsail instance** — `platform/infra/provision.sh`
      *Done when:* `bash platform/infra/provision.sh create` stands up an Ubuntu instance
      (~4 GB, `medium_3_0` — budget a bump to `large_3_0` once six containers are
      running) with a static IP and ports 22/80/443 open; you've pointed a DNS A
      record at the IP and set `SAGE_DOMAIN`.

- [ ] **Container builds** — `Dockerfile`, `web/Dockerfile`
      *Done when:* `docker build .` (Python image, runs api + mcp) and
      `docker build -f web/Dockerfile .` (Next standalone) both succeed;
      `web` has `output: "standalone"`.

- [ ] **Compose stack** — `docker-compose.yml` + `platform/infra/docker-compose.prod.yml` + `platform/infra/Caddyfile`
      *Done when:* `docker compose -f docker-compose.yml -f platform/infra/docker-compose.prod.yml config`
      validates; `... up -d` on the instance brings up `db · mcp · openclaw · api ·
      web · caddy`. `mcp` and `openclaw` publish no ports and aren't in the Caddyfile.

- [ ] **FastAPI app + `/health` behind Caddy — do this early, M3 is waiting** —
      `platform/api/src/sage_api/main.py`, `settings.py`, `deps.py`, `routers/health.py`
      *Done when:* `curl https://$SAGE_DOMAIN/api/health` → 200 and `/api/docs` loads;
      CORS allows the web origin. `./scripts/dev.sh` works locally too.
      *Unblocks:* M3 Sprint 2.

- [ ] **cloud-init** — `platform/infra/cloud-init.yaml`
      *Done when:* a brand-new instance launched with it installs Docker, clones the
      repo, and drops a `.env` template (now including `OPENCLAW_TOKEN`) — leaving
      only "fill in secrets, `compose up`, register the daily automation." No host
      cron — see next sprint.

- [ ] **CI is green on GitHub** — `.github/workflows/ci.yml`
      *Done when:* the workflow passes on `main` and on a PR (ruff / format / mypy /
      pytest + web build/lint — confirm on the remote after the infra dep changes).

- [ ] **First draft of the demo script** — `docs/demo-script.md`
      *Done when:* the run-of-show table has real beats and the hero scenario is
      written out. Demo-driven development starts here.

**S1 gate:** `docker compose up` on the instance serves `/api/health` over HTTPS;
CI green; cloud-init reproduces the box from clean.

---

## Sprint 2 · Sep 15–21 — the API, the agent containers

- [ ] **`agent_runs` table** — `data/warehouse/.../models/schema.sql` (with M1)
      *Done when:* the table exists (`run_id, status, as_of_date, requested_at,
      started_at, finished_at, error`) and `sage-warehouse init-db` creates it.

- [ ] **API routers** — `platform/api/src/sage_api/routers/{brief,runs,signals,ask}.py`
      *Done when:* `GET /brief/latest`, `GET /brief/{id}`, `POST /brief/run`
      (insert an `agent_runs` row, schedule a `BackgroundTasks` job that calls
      OpenClaw, return 202 + `run_id`), `GET /runs/{run_id}` (poll that row),
      `GET /signals`, `POST /ask` (**SSE stream**, proxied from OpenClaw). Reads
      the warehouse via `sage_warehouse`; calls agents via `sage_api.agent`.

- [ ] **Response schemas** — `platform/api/src/sage_api/schemas/*`
      *Done when:* they re-use / mirror `sage_shared.types` and
      [`../contracts/brief-json.md`](../contracts/brief-json.md) — no drift.

- [ ] **`mcp` + `openclaw` containers** — `docker-compose.yml`, `platform/infra/docker-compose.prod.yml`
      *Done when:* `mcp` runs `sage-mcp` (M2's package) and `openclaw` runs the
      gateway, seeded from `./openclaw` (M2 owns the config contents; you own the
      container, volumes, restart policy, and `DATABASE_URL` / `LLM_*` /
      `OPENCLAW_TOKEN` / `MCP_URL` env wiring). Neither is published or routed by
      Caddy. `api` reaches both by service name on the internal network. No
      `worker` container, no host cron — see ADR 0003.

- [ ] **First full deploy**
      *Done when:* `db · mcp · openclaw · api · web · caddy` are all up on the
      instance and talk to each other; M3 points at `https://$SAGE_DOMAIN`.
      (Telegram bot stays on hold this sprint — see ADR 0003.)

**S2 gate (shared, Sep 21):** signals → `agent_runs` → API background task →
OpenClaw → `save_brief` → brief renders in the web app on the instance. **The
most important gate.**

---

## Sprint 3 · Sep 22–28 — scheduled, observable, and the deck

- [ ] **Autonomous runs proven** — OpenClaw's daily automation (M2 registers it;
      you confirm it survives a container restart)
      *Done when:* the hero scenario appears "overnight" with no human trigger
      (OpenClaw's own scheduler fired `sage-briefing`, which called `save_brief`
      directly — no round trip through the API for the scheduled path).

- [ ] **Hardening + graceful degradation**
      *Done when:* the API returns the last good brief if a run fails; the web app
      degrades to its fixture; `restart: unless-stopped` on every service; nothing
      white-screens.

- [ ] **Cost / limits check**
      *Done when:* one Lightsail billing alert is set; you've watched the shared LLM
      endpoint for throttling under a full eval run and noted any backoff needed;
      confirmed the instance size (six containers) is comfortable.

- [ ] **Deck outline + demo-video shot list** — `docs/pitch.md`, `docs/demo-script.md`
      *Done when:* the deck has a slide-by-slide outline (problem → three ideas →
      live demo → eval number → architecture/governance → what's next) and the
      video shot list matches the demo script.

**S3 gate (hard, Sep 28):** `docker compose up` from a clean instance reproduces
everything; hero scenario runs unassisted from the OpenClaw automation;
`git tag demo-freeze`.

---

## Finals · Sep 29 → Oct 10 — land it (you lead this)

- [ ] Record the demo video early (re-record if time allows).
- [ ] Finalise the deck.
- [ ] **≥ 5 full dry runs** with the team.
- [ ] Keep a backup recording in case the live instance misbehaves.
- [ ] Warm up the instance before presenting (run the loop once).
- [ ] Submit a day early.

---

## What you hand off / provide

| To | Artifact | By |
| --- | --- | --- |
| M2 | LLM endpoint: `LLM_BASE_URL` + `LLM_API_KEY` + model string + protocol | Sep 9 |
| M3 | API base URL + `/api/health` + OpenAPI docs over HTTPS | Sep 15 |
| all | First full deploy on the instance | Sep 21 |
| all | `git tag demo-freeze` + backup recording | Sep 28 |

## What you depend on

| From | Artifact | Expected |
| --- | --- | --- |
| organisers | LLM endpoint creds + model string | Sep 9 |
| M1 | Warehouse schema + `sage-warehouse init-db` (runs in the `api` container) | Sep 19 |
| M2 | `agent/openclaw/` config (agent definitions, prompts) + `sage_shared.openclaw` client + what `save_brief` expects in an `agent_runs` row | Sep 18 |
| M2 | Eval headline number | Sep 27 |
| M3 | Brief screenshot + UI copy for the deck | Sep 27 |

## Your items on the cut list (if a sprint slips — order matters)

1. OpenClaw automation → trigger the briefing live via a button (demo it instead
   of "it ran overnight"); the API's `POST /brief/run` path already exists, so
   this is cutting a `openclaw automations create` call, not a code path.
2. (support M3) UI polish is theirs to cut, not yours.

**Never cut:** the reproducible `docker compose up` deploy. (Telegram push was
the old "best moment" — it's on hold pending the delivery-channel decision; see
ADR 0003. Don't plan the demo's best moment around it until that's resolved.)

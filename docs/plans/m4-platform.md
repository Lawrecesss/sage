# M4 — Platform Engineer & Product Lead

## Lane summary

- **Owns:** the Lightsail instance + `docker-compose` deploy, the API service, the
  Telegram bot, CI/CD — **and** the pitch, deck, demo script and video.
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
| Deploy kit | `infra/cloud-init.yaml`, `infra/docker-compose.prod.yml`, `infra/Caddyfile`, `infra/provision.sh` |
| Container builds | `Dockerfile` (api + worker), `apps/web/Dockerfile` |
| Base compose | `docker-compose.yml` |
| API service | `packages/api/src/sage_api/` — `main.py`, `settings.py`, `deps.py`, `routers/*`, `schemas/*` |
| Job queue table | `packages/warehouse/.../models/schema.sql` (`agent_runs`) — with M1 |
| Telegram | `packages/notifier/src/sage_notifier/{telegram,render}.py` |
| CI | `.github/workflows/ci.yml`, `deploy.yml` |
| Product docs | `docs/demo-script.md`, `docs/pitch.md`, `docs/runbook.md` |

Run API tests: `uv run pytest packages/api packages/notifier`.

---

## Sprint 1 · Sep 8–14 — the instance, the containers, and the API M3 needs

- [ ] **🚨 Get the LLM endpoint from the organisers — TODAY.** Blocks every M2 sprint.
      *Done when:* you have `LLM_BASE_URL` + `LLM_API_KEY`, you've confirmed the
      **model string** (Sonnet 4.5) and whether the endpoint is native Ollama
      (`/api/chat`) or OpenAI-shaped (`/v1`), and you've passed all of it to M2.

- [ ] **Create the Lightsail instance** — `infra/provision.sh`
      *Done when:* `bash infra/provision.sh create` stands up an Ubuntu instance
      (~4 GB, `medium_3_0`) with a static IP and ports 22/80/443 open; you've pointed
      a DNS A record at the IP and set `SAGE_DOMAIN`.

- [ ] **Container builds** — `Dockerfile`, `apps/web/Dockerfile`
      *Done when:* `docker build .` (Python image, runs api + worker) and
      `docker build -f apps/web/Dockerfile .` (Next standalone) both succeed;
      `apps/web` has `output: "standalone"`.

- [ ] **Compose stack** — `docker-compose.yml` + `infra/docker-compose.prod.yml` + `infra/Caddyfile`
      *Done when:* `docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml config`
      validates; `... up -d` on the instance brings up `db · api · worker · web · caddy`.

- [ ] **FastAPI app + `/health` behind Caddy — do this early, M3 is waiting** —
      `packages/api/src/sage_api/main.py`, `settings.py`, `deps.py`, `routers/health.py`
      *Done when:* `curl https://$SAGE_DOMAIN/api/health` → 200 and `/api/docs` loads;
      CORS allows the web origin. `./scripts/dev.sh` works locally too.
      *Unblocks:* M3 Sprint 2.

- [ ] **cloud-init** — `infra/cloud-init.yaml`
      *Done when:* a brand-new instance launched with it installs Docker, clones the
      repo, and drops a `.env` template + the daily cron — leaving only "fill in
      secrets, `compose up`".

- [ ] **CI is green on GitHub** — `.github/workflows/ci.yml`
      *Done when:* the workflow passes on `main` and on a PR (ruff / format / mypy /
      pytest + web build/lint — confirm on the remote after the infra dep changes).

- [ ] **First draft of the demo script** — `docs/demo-script.md`
      *Done when:* the run-of-show table has real beats and the hero scenario is
      written out. Demo-driven development starts here.

**S1 gate:** `docker compose up` on the instance serves `/api/health` over HTTPS;
CI green; cloud-init reproduces the box from clean.

---

## Sprint 2 · Sep 15–21 — the API, the worker, the phone

- [ ] **`agent_runs` table** — `packages/warehouse/.../models/schema.sql` (with M1)
      *Done when:* the table exists (`run_id, status, as_of_date, requested_at,
      started_at, finished_at, error`) and `sage-warehouse init-db` creates it.

- [ ] **API routers** — `packages/api/src/sage_api/routers/{brief,signals,ask}.py`
      *Done when:* `GET /brief/latest`, `GET /brief/{id}`, `POST /brief/run`
      (insert an `agent_runs` row, return 202), `GET /signals`, `POST /ask`
      (**SSE stream**). Reads the warehouse via `sage_warehouse`.

- [ ] **Response schemas** — `packages/api/src/sage_api/schemas/*`
      *Done when:* they re-use / mirror `sage_shared.types` and
      [`../contracts/brief-json.md`](../contracts/brief-json.md) — no drift.

- [ ] **Worker container** — `infra/docker-compose.prod.yml` + M2's `sage_agents.runtime`
      *Done when:* the `worker` service runs `python -m sage_agents.runtime`, which
      claims a `queued` row and runs M2's orchestration. (M2 owns the loop body; you
      own the container + restart policy + `DATABASE_URL`/`LLM_*` env wiring.)

- [ ] **Host cron** — `infra/cloud-init.yaml`
      *Done when:* `/etc/cron.d/sage-briefing` POSTs `/api/brief/run` daily and logs
      to `/var/log/sage-cron.log`.

- [ ] **Telegram bot** — `packages/notifier/src/sage_notifier/{telegram,render}.py`
      *Done when:* `render.py` turns a `MorningBrief` into a compact message
      (headline + top 3 titles + recommended action); `telegram.py` sends it. A
      brief lands on a **real phone**.

- [ ] **First full deploy**
      *Done when:* `db · api · worker · web · caddy` are all up on the instance and
      talk to each other; M3 points at `https://$SAGE_DOMAIN`.

**S2 gate (shared, Sep 21):** signals → `agent_runs` → worker → brief → Telegram on a
phone → brief renders in the web app on the instance. **The most important gate.**

---

## Sprint 3 · Sep 22–28 — scheduled, observable, and the deck

- [ ] **Autonomous runs proven** — the host cron
      *Done when:* the hero scenario appears "overnight" with no human trigger (the
      cron POSTed `/api/brief/run`, the worker did the rest).

- [ ] **Trace view (optional)** — `jaeger` service in `docker-compose.yml` + OTLP env
      *Done when:* Strands agent traces show in Jaeger (`:16686`) — something you can
      put on screen during the demo (a scoring opportunity). Cut this first if time is short.

- [ ] **Hardening + graceful degradation**
      *Done when:* the API returns the last good brief if a run fails; the web app
      degrades to its fixture; `restart: unless-stopped` on every service; nothing
      white-screens.

- [ ] **Cost / limits check**
      *Done when:* one Lightsail billing alert is set; you've watched the shared LLM
      endpoint for throttling under a full eval run and noted any backoff needed.

- [ ] **Deck outline + demo-video shot list** — `docs/pitch.md`, `docs/demo-script.md`
      *Done when:* the deck has a slide-by-slide outline (problem → three ideas →
      live demo → eval number → architecture/governance → what's next) and the
      video shot list matches the demo script.

**S3 gate (hard, Sep 28):** `docker compose up` from a clean instance reproduces
everything; hero scenario runs unassisted from the cron; `git tag demo-freeze`.

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
| M2 | `sage_agents.runtime` worker loop + what it expects in an `agent_runs` row | Sep 18 |
| M2 | Eval headline number | Sep 27 |
| M3 | Brief screenshot + UI copy for the deck | Sep 27 |

## Your items on the cut list (if a sprint slips — order matters)

1. Jaeger trace view → drop it; tail `worker` logs on screen instead.
2. Host cron → trigger the briefing live via a button (demo it instead of "it ran
   overnight").
3. (support M3) UI polish is theirs to cut, not yours.

**Never cut:** the reproducible `docker compose up` deploy, the Telegram push (it's
the demo's best moment).

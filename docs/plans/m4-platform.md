# M4 — Platform Engineer & Product Lead

## Lane summary

- **Owns:** CDK/IaC, deployment, the API service, the Telegram bot, CI/CD, cost
  monitoring — **and** the pitch, deck, demo script and video.
- **Backs up:** M3 on API integration.
- **Success test:** `cdk deploy` from a clean account reproduces the whole system,
  and the credit balance is still healthy.
- **You have two jobs.** The platform work is front-loaded; the product work
  (deck, video, dry runs) is the back half. Plan for both from day one.

## Skills this lane wants

AWS (Lambda, API Gateway, RDS, SQS, EventBridge, Amplify), CDK (Python), CI/CD,
cost discipline — **and comfort presenting**, since you own the pitch and demo.

## Where your code goes

| Area | Path |
| --- | --- |
| CDK app + stacks | `infra/app.py`, `infra/stacks/{data,api,agents,frontend}_stack.py` |
| API service | `packages/api/src/sage_api/` |
| API routers / schemas | `packages/api/src/sage_api/routers/*`, `schemas/*` |
| Lambda handler | `packages/api/src/sage_api/handler.py` |
| Telegram / SES | `packages/notifier/src/sage_notifier/{telegram,render}.py` |
| CI | `.github/workflows/ci.yml`, `deploy.yml` |
| Product docs | `docs/demo-script.md`, `docs/pitch.md`, `docs/runbook.md` |

Run API tests: `uv run pytest packages/api packages/notifier`.

---

## Sprint 1 · Sep 8–14 — accounts, skeleton stack, and the API M3 needs

- [ ] **🚨 Request Bedrock model access — TODAY.** Approval can take days and blocks
      every M2 sprint.
      *Done when:* the request for `anthropic.claude-opus-5`, `-sonnet-5`,
      `-haiku-4-5` is submitted in the target region, and you've told M2 to develop
      against the direct Anthropic API until it lands.

- [ ] **AWS accounts + budget alarms**
      *Done when:* the team account is set up and **budget alarms fire at
      $25 / $50 / $75**. Hard gate: ≤ $50 consumed by Sep 28.

- [ ] **Region check** — time-box to **1 hour**
      *Done when:* you know whether `ap-southeast-1` has the models. If yes, deploy
      the demo there (latency + "data stays in region"). If not, `us-west-2`. It's a
      config value, not a feature — set `AWS_REGION` and move on.

- [ ] **CDK skeleton** — `infra/app.py`, `infra/stacks/*_stack.py`
      *Done when:* `data_stack` (RDS `db.t4g.micro` + pgvector, S3 raw bucket,
      EventBridge Scheduler), `api_stack` (API Gateway + Lambda + SQS),
      `agents_stack` (worker Lambda, Bedrock IAM, OTel), `frontend_stack` (Amplify)
      all `cdk synth`, and `cdk deploy` stands up an empty-but-real stack.
      **🚫 Do not add:** OpenSearch Serverless, Aurora provisioned, NAT Gateway,
      always-on Fargate (see [`../architecture.md`](../architecture.md)).

- [ ] **FastAPI app + `/health` — do this early, M3 is waiting** —
      `packages/api/src/sage_api/main.py`, `settings.py`, `deps.py`,
      `routers/health.py`
      *Done when:* `uv run uvicorn sage_api.main:app` serves `/health` → 200 and
      `/docs`; CORS allows `localhost:3000`. `./scripts/dev.sh` now works.
      *Unblocks:* M3 Sprint 2.

- [ ] **CI is green on GitHub** — `.github/workflows/ci.yml`
      *Done when:* the workflow passes on `main` and on a PR (it already runs
      ruff / format / mypy / pytest + web build/lint — confirm on the remote).

- [ ] **First draft of the demo script** — `docs/demo-script.md`
      *Done when:* the run-of-show table has real beats and the hero scenario is
      written out. Demo-driven development starts here.

**S1 gate:** `cdk deploy` reproduces an empty stack from clean; `/health` is live
locally; CI green on GitHub.

---

## Sprint 2 · Sep 15–21 — the API, the worker, the phone

- [ ] **API routers** — `packages/api/src/sage_api/routers/{brief,signals,ask}.py`
      *Done when:* `GET /brief/latest`, `GET /brief/{id}`, `POST /brief/run`
      (enqueue → SQS, 202), `GET /signals`, `POST /ask` (**SSE stream**). Reads from
      the warehouse via `sage_warehouse`.

- [ ] **Response schemas** — `packages/api/src/sage_api/schemas/*`
      *Done when:* they re-use / mirror `sage_shared.types` and
      [`../contracts/brief-json.md`](../contracts/brief-json.md) — no drift.

- [ ] **Lambda handler** — `packages/api/src/sage_api/handler.py`
      *Done when:* Mangum wraps the app; deploys to Lambda behind API Gateway.

- [ ] **Agent worker Lambda** — `infra/stacks/agents_stack.py` + wiring to
      `sage_agents.runtime`
      *Done when:* an SQS message triggers the worker, which runs M2's
      `runtime.py` orchestration and writes a `MorningBrief`.

- [ ] **Telegram bot** — `packages/notifier/src/sage_notifier/{telegram,render}.py`
      *Done when:* `render.py` turns a `MorningBrief` into a compact message
      (headline + top 3 titles + recommended action); `telegram.py` sends it. A
      brief lands on a **real phone**.

- [ ] **First full AWS deploy**
      *Done when:* API + web (Amplify) + worker are all deployed and talk to each
      other. M3 points at the real API URL.

**S2 gate (shared, Sep 21):** signals → worker → brief → Telegram on a phone → brief
renders in the web app on AWS. **The most important gate in the plan.**

---

## Sprint 3 · Sep 22–28 — scheduled, observable, and the deck

- [ ] **Scheduled runs** — `infra/stacks/data_stack.py` (EventBridge Scheduler)
      *Done when:* a cron rule enqueues a briefing run; the hero scenario appears
      "overnight" with no human trigger.

- [ ] **Trace dashboard** — OTel → CloudWatch
      *Done when:* Strands agent traces are visible on a dashboard you can put on
      screen during the demo (a scoring opportunity).

- [ ] **Hardening + graceful degradation**
      *Done when:* the API returns the last good brief if an agent run fails; the
      web app degrades to the fixture; nothing white-screens.

- [ ] **Cost check** — AWS Cost Explorer + Bedrock token spend
      *Done when:* consumed spend is confirmed **≤ $50** with headroom for dry runs.

- [ ] **Deck outline + demo-video shot list** — `docs/pitch.md`, `docs/demo-script.md`
      *Done when:* the deck has a slide-by-slide outline (problem → three ideas →
      live demo → eval number → architecture/governance → what's next) and the
      video shot list matches the demo script.

**S3 gate (hard, Sep 28):** `cdk deploy` from clean reproduces everything; hero
scenario runs unassisted from the schedule; `git tag demo-freeze`.

---

## Finals · Sep 29 → Oct 10 — land it (you lead this)

- [ ] Record the demo video early (re-record if time allows).
- [ ] Finalise the deck.
- [ ] **≥ 5 full dry runs** with the team.
- [ ] Keep a backup recording in case live AWS misbehaves.
- [ ] Warm up the demo account before presenting.
- [ ] Submit a day early.

---

## What you hand off / provide

| To | Artifact | By |
| --- | --- | --- |
| M2 | Bedrock access confirmed (or fallback instruction) | Sep 9 |
| M3 | API base URL + `/health` + OpenAPI docs | Sep 15 |
| all | First full AWS deploy | Sep 21 |
| all | `git tag demo-freeze` + backup recording | Sep 28 |

## What you depend on

| From | Artifact | Expected |
| --- | --- | --- |
| M1 | Warehouse schema `cdk` can reproduce on RDS | Sep 21 |
| M2 | `runtime.py` worker entrypoint + SQS message contract | Sep 18 |
| M2 | Eval headline number | Sep 27 |
| M3 | Brief screenshot + UI copy for the deck | Sep 27 |

## Your items on the cut list (if a sprint slips — order matters)

1. Scheduled runs → trigger the briefing manually via a button (demo it live
   instead of "it ran overnight").
2. (support M3) UI polish is theirs to cut, not yours.

**Never cut:** the frozen dataset snapshot deploy path, the Telegram push (it's the
demo's best moment).

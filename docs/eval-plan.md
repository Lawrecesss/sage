# Evaluation plan

The eval number goes on a slide. `packages/evals` replays the full pipeline over
the **frozen dataset snapshot** and scores against the planted incident library.

## Layers of verification

### Data layer
Load the frozen dataset; assert every planted incident in `incidents/` is visible
as a metric deviation. `pytest packages/warehouse` checks referential integrity and
that metric SQL returns sane values at every grain.

### Metric layer
Golden-file tests: each metric queried at day/week/month grain against a fixed
dataset produces known values. Any drift fails CI.

### Detectors
Run against the incident library, report precision/recall per detector.
**Targets:** recall > 0.8 on obvious + subtle incidents; false-positive rate low
enough that a brief has ≤ 5 items.

### Agents — the headline number
`packages/evals` replays the pipeline over the frozen dataset and scores:

| Metric | Definition |
| --- | --- |
| **Detection recall** | % of planted incidents surfaced |
| **Correlation accuracy** | % of causal chains matching the ground-truth chain |
| **Impact estimation error** | predicted vs. true dollar impact |
| **Lead time** | days earlier than the incident would surface in a manual monthly review |
| **Precision** | % of surfaced items that correspond to a real planted incident |

Run it in CI on every agent-prompt change.

### End to end
Trigger a run on the deployed instance (`POST /api/brief/run`, or wait for the host
cron). Verify: an `agent_runs` row is claimed by the `worker` → signals in Postgres
→ brief generated → Telegram message received on a phone → brief renders in the web
app → a follow-up in Ask returns a correct, metric-cited answer → the recommended
action shows with its dollar rationale. **The whole loop must complete in under 90
seconds** for a live demo.

### Cost & rate limits
LLM inference runs on the **organisers' Bedrock bill** — no per-token cost to us.
What to watch instead: **rate limiting / throttling** on the shared endpoint. Keep
eval runs against the frozen dataset (reproducible, and re-runnable without burning
quota), back off on 429s, and don't loop the full pipeline in CI more than needed.
Our only AWS spend is the flat ~$24/mo Lightsail instance — one Lightsail billing
alert is enough.

## The frozen dataset

M1 freezes the demo dataset as a **versioned snapshot** at the end of Sprint 3.
Everything after that runs against it — deterministic, reproducible, live-demo-safe.

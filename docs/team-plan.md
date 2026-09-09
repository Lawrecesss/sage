# Team plan — 4 members

Build phase: **Sep 8 → Sep 28** (3 weeks). Hard code freeze Sep 28. Sep 29 → Oct 10
is hardening, deck, demo video, dry runs, finals — **no new features**.

Each person **owns a lane** and **backs up one other**. Owner has final say in their
lane; no design-by-committee.

## Committed scope vs. stretch

| Area | Committed — ships by Sep 28 | Stretch — only if a sprint finishes early |
| --- | --- | --- |
| Data sources | 3: Sales, Inventory, Accounting | 4th: Customer/support tickets; 5th: Operations |
| History | 12 months | 18 months |
| Planted incidents | ~20 (obvious + subtle + a few cross-domain-only) | ~40, more incident types |
| Metric layer | ~20–25 metrics | 40–50 metrics |
| Detectors | z-score, WoW change, threshold breach | STL residual, run-length, ratio drift |
| Agents | 1 parameterised Watcher, Correlator, Briefing, Ask | Separate tuned watcher per domain |
| Actions | Correlator recommends actions as text in the brief | Action agent drafts PO/email/reply + approval queue |
| Delivery | Web app (Brief + Ask + Signals) + Telegram push | In-app approval UX, Connections page animation |
| Infra | Lambda + API GW + RDS + EventBridge; demo user (no auth) | AgentCore Runtime, Cognito |
| Proof | Eval harness with a headline number | Prompt hill-climbing rounds |

**Never cut:** the metric layer, the Correlator agent, the Morning Brief UI, the
eval harness, the frozen dataset snapshot.

**Cut list** (order things get cut if a sprint slips): 1. Ask chat richness →
single-turn Q&A, no inline charts. 2. 3rd source (Accounting) → ship Sales +
Inventory. 3. Scheduled runs → manual trigger button. 4. UI polish → function over
finish. 5. Detector count → z-score + threshold only.

## Lanes

### M1 — Data & Metrics Engineer
Owns: synthetic generator, incident library, warehouse schema, metric layer, detectors.
Backs up: M4 on infrastructure.
- **Wk1 (Sep 8–14):** entity model + generator for the 3 sources → 12 months of
  *correlated* data; star schema in Postgres; ~5 incidents planted; tool JSON
  schemas frozen with M2.
- **Wk2 (Sep 15–21):** `metrics.yaml` (~20–25) + `query_metric` / `list_metrics` /
  `trace_lineage`; all 3 detectors writing to `signals`; remaining ~15 incidents;
  `$`-impact estimation per signal.
- **Wk3 (Sep 22–28):** realism tuning (seasonality, weekday effects, noise, partial
  refunds); signal ranking so a brief has ≤5 items; **freeze the demo dataset as a
  versioned snapshot**; hand eval ground-truth to M2.
- **Success test:** every planted incident is visible as a metric deviation, and the
  data passes a "does this look real?" eyeball from someone outside the team.

### M2 — Agent Engineer
Owns: Strands agents, tool surface, prompts, Bedrock integration, eval harness.
Backs up: M1 on detectors.
- **Wk1:** Strands + Bedrock hello-world; tool contracts frozen with M1;
  parameterised Watcher against *stub* signals; brief-JSON shape agreed with M3.
- **Wk2:** Watcher across all 3 domains on *real* signals + Briefing agent → a full
  morning brief from real data; Ask agent v1 (single-turn, metric-cited).
- **Wk3:** Correlator/Analyst — cross-domain causal chains, `$`-impact ranking,
  recommended action as text; eval harness scoring recall / precision / lead-time;
  prompt caching on the metric catalog; one tuning pass.
- **Success test:** the eval harness runs and prints a number, and the hero
  scenario's causal chain matches the ground truth.

### M3 — Frontend & Experience Engineer
Owns: the entire Next.js app, visual design, interaction, the demo's look.
Backs up: M2 on tool/API contracts.
- **Wk1:** app shell, design system, static Morning Brief mock against the frozen
  brief-JSON contract (no backend needed).
- **Wk2:** live Morning Brief (severity-ranked cards, sparklines, "why" expansion) +
  Signals list, wired to the real API.
- **Wk3:** Ask chat with streaming + inline charts + citations; static "3 systems,
  one brain" Connections visual; polish pass — empty/loading/error states, mobile,
  motion.
- **Success test:** the Morning Brief screenshot alone communicates the product
  without narration.

### M4 — Platform Engineer & Product Lead
Owns: CDK/IaC, deployment, API service, Telegram bot, CI/CD, cost monitoring — and
the pitch, deck, demo script and video. Backs up: M3 on API integration.
- **Wk1:** AWS accounts; **Bedrock model access request on day 1** (approval can
  take days); CDK skeleton (RDS, S3, Lambda, API GW, EventBridge, SQS); CI
  pipeline; budget alarms at $25/$50/$75; first draft of `docs/demo-script.md`.
- **Wk2:** FastAPI on Lambda + SQS-triggered agent worker; first full deploy to
  AWS; Telegram bot pushing the brief to a real phone.
- **Wk3:** EventBridge scheduled runs; CloudWatch / OTel trace dashboard; hardening
  and graceful degradation; deck outline + demo-video shot list.
- **Success test:** `cdk deploy` from a clean account reproduces the whole system,
  and the credit balance is still healthy.

## Working agreements

- Daily 15-min standup, async written status in a shared channel.
- **Contracts before code.** M1↔M2 freeze tool JSON schemas in week 1; M2↔M3 freeze
  brief-JSON + API shapes the same way. Everyone codes against stubs — no one waits.
- **Demo-driven development.** `docs/demo-script.md` exists by end of week 1.
  Anything that doesn't show in the demo or move the eval number is a stretch item.
- **Twice-weekly integration (Tue + Fri).** End to end locally by the first Tue, on
  AWS from the end of week 1. A big-bang integration at the end is not survivable.

## Timeline — 3 build sprints + finals

- **Sprint 1 · Sep 8–14 — Foundations & frozen contracts.** Bedrock access
  requested day 1. Repo + CI + budget alarms. Generator producing plausible
  3-source data. Star schema live. Strands + Bedrock hello-world. App shell rendering
  the static brief mock. CDK skeleton deploys an empty stack.
  **Gate (Sep 14):** every member's lane runs locally; tool-JSON and brief-JSON
  contracts signed and committed.
- **Sprint 2 · Sep 15–21 — The vertical slice, end to end on AWS.** Full pipeline
  for all 3 domains but shallow: generator → warehouse → ~20 metrics → 3 detectors
  → Watcher → Briefing → real brief in the deployed web app, pushed to Telegram.
  Ask answers a single question with a citation.
  **Gate (Sep 21):** a real anomaly, detected and explained, visible in a browser
  on AWS and on a phone. **The most important gate in the plan.**
- **Sprint 3 · Sep 22–28 — The differentiator, then freeze.** Correlator shipping
  real cross-domain causal chains with `$`-impact ranking and a recommended action.
  Eval harness producing a headline number. Scheduled autonomous runs via
  EventBridge. Realism tuning. Dataset snapshot frozen. UI polish. Cost check.
  **Gate (Sep 28, hard):** the hero scenario runs end to end, unassisted, from a
  scheduled trigger. Code freeze. `git tag demo-freeze`.
- **Finals · Sep 29 → Oct 10 — Land it.** Bugfixes only. Demo video recorded early.
  Deck finalised. ≥5 full dry runs. Backup recording. Demo account warmed up.
  Submit a day early.

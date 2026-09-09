# Execution plans

One assignable checklist per member. Scope, the committed-vs-stretch table, the
cut list and working agreements live in [`../team-plan.md`](../team-plan.md) — this
folder is **what each person does, in what order, against which files**.

| Lane | Doc | Owns |
| --- | --- | --- |
| **M1** | [m1-data-metrics.md](m1-data-metrics.md) | Generator, incident library, warehouse schema, metric layer, detectors |
| **M2** | [m2-agents.md](m2-agents.md) | Strands agents, tool surface, prompts, LLM integration, eval harness |
| **M3** | [m3-frontend.md](m3-frontend.md) | The Next.js app, design system, Brief / Signals / Ask / Connections |
| **M4** | [m4-platform.md](m4-platform.md) | Lightsail deploy, API, Telegram, CI/CD — **plus** pitch, deck, demo video |

Each doc is self-contained: pick it up and start without reading the other three.

---

## Timeline

Build **Sep 8 → Sep 28** (3 sprints). Today is **Sep 9** — Sprint 1, day 2.

| Sprint | Dates | Theme |
| --- | --- | --- |
| S1 | Sep 8–14 | Foundations & frozen contracts |
| S2 | Sep 15–21 | The vertical slice, end to end on the instance |
| S3 | Sep 22–28 | The differentiator, then freeze |
| Finals | Sep 29 → Oct 10 | Bugfixes, deck, demo video, ≥5 dry runs — no new features |

## Gate calendar

| Date | Gate | Who proves it |
| --- | --- | --- |
| **Sep 14** | Every member's lane runs locally; tool-JSON **and** brief-JSON contracts signed and committed | all |
| **Sep 21** | **A real anomaly, detected and explained, visible in a browser on the deployed instance and on a phone.** The most important gate in the plan — if it's at risk, everyone stops adding scope and makes this work | M1+M2+M3+M4 |
| **Sep 28 (hard)** | The hero scenario (supplier delay → stockout → revenue + margin → recommended recovery action) runs end to end, unassisted, from the host cron. **Code freeze. `git tag demo-freeze`** | all |

## Critical path — start these first

1. **LLM endpoint creds — M4, today.** Get `LLM_BASE_URL` + `LLM_API_KEY` from the
   organisers and confirm the model string + protocol (native Ollama vs OpenAI `/v1`).
   M2 is blocked on this. Also today: create the Lightsail instance + static IP + DNS.
2. **API `/health` behind Caddy over HTTPS — M4, Sprint 1.** M3 can build the static
   Brief without it, but cannot wire the *live* Brief in Sprint 2 until the API answers
   at `https://$SAGE_DOMAIN/api/health`.
3. **Contract freezes by Sep 14:**
   - Tool JSON schemas — **M1 ↔ M2** — [`../contracts/tool-schemas.md`](../contracts/tool-schemas.md)
   - Brief-JSON — **M2 ↔ M3** — [`../contracts/brief-json.md`](../contracts/brief-json.md)
   - Everyone codes against stubs until the real thing lands. No one waits.

## Handoff matrix

| From → To | Artifact | By |
| --- | --- | --- |
| M1 → M2 | Tool JSON schemas frozen (`query_metric`, `list_metrics`, `get_signals`, `compare_period`, `trace_lineage`) | Sep 14 |
| M2 → M3 | Brief-JSON shape frozen (`MorningBrief` / `BriefItem` / `CausalChain`) | Sep 14 |
| M4 → M2 | `LLM_BASE_URL` + `LLM_API_KEY` + model string + protocol confirmed | Sep 9 |
| M4 → M3 | API base URL + `/api/health` + OpenAPI docs reachable over HTTPS | Sep 15 |
| M1 → M2 | Real `signals` table populated from real detectors (all 3 domains) | Sep 19 |
| M2 → M3 | A real `MorningBrief` payload from `/brief/latest` | Sep 20 |
| M4 → all | First full deploy on the instance (db · api · worker · web · caddy) | Sep 21 |
| M1 → M2 | **Eval ground-truth**: frozen dataset snapshot + complete incident library | **Sep 26** (M2 needs runway before the Sep 28 gate) |
| M2 → M4 | Eval headline number for the deck | Sep 27 |

## Picking a lane

Not yet assigned. Rough fit:

| Lane | Wants | Note |
| --- | --- | --- |
| **M1** | SQL, Polars/pandas, a bit of stats (z-score, seasonality) | Most upfront, least blocked — good for a fast starter |
| **M2** | Python, LLM prompting, eval/measurement instinct | Blocked until M4 hands over the LLM endpoint creds; the Correlator is the product |
| **M3** | React / TypeScript / Next.js, visual taste | Least blocked (static mock in S1); the Brief screenshot carries the pitch |
| **M4** | Linux + Docker + Caddy, a little Lightsail, CI — **and comfort presenting** | Also owns pitch + deck + demo video, so it suits whoever will be on stage |

Everyone backs up one other lane (M1↔M4 infra, M2↔M1 detectors, M3↔M2 contracts,
M4↔M3 API). Owner has final say in their lane.

## Working agreements (full text in [`../team-plan.md`](../team-plan.md#working-agreements))

Daily 15-min standup · contracts before code · demo-driven (if it's not in
`../demo-script.md` or doesn't move the eval number, it's a stretch item) ·
twice-weekly integration (Tue + Fri), end to end on the instance from the end of Sprint 1.

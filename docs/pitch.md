# Pitch

> **Status: OUTLINE.** Owned by M4. Finalise during the Sep 29 → Oct 10 window.

## One-liner

Sage is an agentic monitoring layer that watches an SME's whole business —
sales, inventory, accounting — and brings the owner one prioritised morning brief
of what actually matters, why, and what to do about it.

## The problem

SME owners get business signal from five disconnected systems and become the
integration layer themselves: pulling reports, eyeballing spreadsheets,
reconstructing "how is the business doing?" from fragments. The cost is **latency
to insight** — a stockout that killed a category's revenue on Tuesday is discovered
on Friday, if at all.

## Why a dashboard is the wrong answer

BI tools exist and SMEs mostly don't use them: a dashboard still requires the owner
to know what to look for and to go looking. The unmet need isn't visualisation —
it's **attention**. Something must watch continuously, decide what matters, explain
why, and bring it to the owner.

## What makes Sage win

1. **A metric layer, not text-to-SQL** — agents call a governed catalog, never
   write raw SQL. Eliminates the "confidently wrong number" failure mode and gives
   judges the governance story: every claim traces to a metric definition.
2. **Detection is deterministic; explanation is the LLM** — reproducible run to
   run (critical for a live demo), and it keeps the anomaly hunt off the LLM
   entirely, so the shared inference endpoint only does the interpreting.
3. **Cross-source correlation is the product** — only a system reading sales +
   inventory + accounting together produces the supplier-delay → stockout →
   revenue → margin → recoverable-cash chain. That's the demo moment.

## The measured claim

"On 12 months of SME data with ~20 planted incidents, Sage surfaced N of them, a
median of X days earlier than manual review, at Y minutes of owner attention per
day." — produced by `packages/evals`, on a slide.

## Stack credibility

Runs on **AWS Lightsail**; agents built on the **Strands Agents SDK** against a
**Bedrock-backed** inference endpoint. The whole system is one `docker compose up`
on a fresh instance — reproducible from clean, local == prod.

Note we deliberately run a **single mid-tier model (Claude Sonnet 4.5)** for every
agent. The reliability comes from the *architecture* — a governed metric layer so no
number is hallucinated, deterministic detection so anomalies are found the same way
every run, and a Correlator constrained to a strict output schema over existing
signals — not from throwing a frontier model at the problem.

## Deck outline (TBD)

1. Mei's morning (the problem) · 2. Why dashboards fail · 3. Sage — the three ideas
· 4. Live demo · 5. The eval number · 6. Architecture & governance · 7. What's next
(Action agent + approval queue).

# 1. Record architecture decisions

Date: 2026-09-08 · Status: accepted

## Context

Four people, three weeks. Decisions get re-litigated when they aren't written down.

## Decision

We keep short ADRs in `docs/decisions/`, numbered sequentially. One decision per
file: context, decision, consequences. An ADR is added when a choice would
otherwise be re-argued in standup.

## Decisions already made (from the planning discussion)

- **Team:** balanced full-stack, 4 people, one owned lane each.
- **Data:** fully synthetic SME dataset with ~20 planted incidents.
- **Agent stack:** Strands Agents SDK. ~~AWS-native + Amazon Bedrock~~ →
  **superseded by [0002](0002-lightsail-single-instance.md)**: Lightsail + the
  organisers' Bedrock-backed endpoint, one model (Sonnet 4.5).
- **Vertical:** retail / e-commerce SME, multi-channel (own store + marketplace).
- **Persona:** "Lian & Co." / owner Mei. One persona, one story.
- **Metric layer, not text-to-SQL.** Agents never write raw SQL.
- **Detection deterministic, explanation LLM.** Statistics find anomalies; the LLM
  interprets and communicates.
- **3 committed sources** (Sales, Inventory, Accounting); customer support +
  operations are stretch.
- **No auth for the demo** — hardcoded demo user.
- ~~**Lambda for agent hosting.**~~ → **superseded by [0002](0002-lightsail-single-instance.md)**:
  a `worker` container polling an `agent_runs` table on one Lightsail instance.

## Consequences

The differentiator (cross-source correlation) is in committed scope. Almost
everything else is negotiable and lives in the stretch bucket in
[`../team-plan.md`](../team-plan.md).

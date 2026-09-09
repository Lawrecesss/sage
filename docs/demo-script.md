# Demo script

> **Status: DRAFT — fill in by end of Sprint 1.** Demo-driven development: this file
> is the source of truth for what gets built. If a feature isn't in this script or
> doesn't move the eval number, it's a stretch item.

## The persona (never deviate)

**"Lian & Co."** — Singapore homeware retailer. 1 physical outlet + Shopify store +
Lazada/Shopee. ~1,200 SKUs, 6 staff, ~S$180k monthly revenue. Owner **Mei** spends
~45 min every morning across five tabs. Everything in the demo is Mei's business.
One persona, one story.

## The claim on stage

> "On 12 months of SME data with ~20 planted incidents, Sage surfaced **N** of them,
> a median of **X days** earlier than manual review, at **Y minutes** of owner
> attention per day."

Numbers come from `packages/evals`. Do not say a number the harness hasn't produced.

## The hero scenario (scripted end to end)

Supplier delay → stockout → revenue + margin → recommended recovery action:

> "Supplier SG-Textiles slipped 6 days on PO-4471 → 'Linen Throw' stocked out Tue →
> that SKU's category revenue fell S$4,200 and gross margin dropped 2pts as you
> backfilled with a pricier substitute → S$3,100 of it is still recoverable if
> PO-4471 is expedited (S$180 rush fee)."

This is one of the cross-domain-only incidents in
`packages/generator/src/sage_generator/incidents/planted/`.

## Run of show (target: full loop < 90s)

| # | Beat | Screen | Notes |
| --- | --- | --- | --- |
| 1 | The problem — five tabs, no answer | (slide) | 30s max |
| 2 | Scheduled run fires | Jaeger trace view / `worker` logs | "the host cron fired this at 6am, unassisted" |
| 3 | Telegram push lands on a real phone | phone on stage | the money shot |
| 4 | Morning Brief opens | `apps/web` `/` | ≤5 severity-ranked cards |
| 5 | Expand the hero card — the causal chain | Brief card "why" | every number cites a metric |
| 6 | Recommended action + dollar rationale | Brief card | "expedite PO-4471, S$180 rush, S$3,100 recoverable" |
| 7 | Ask a follow-up in plain language | `/ask` | streamed, metric-cited answer |
| 8 | The eval number | (slide) | recall / lead-time / precision |
| 9 | Governance — `trace_lineage` on a metric | `/ask` or Connections | "every claim is traceable" |

## Backup plan

Pre-recorded video of the full loop. Deterministic frozen dataset. Demo account
warmed up before presenting. If the live instance misbehaves, cut to the recording.

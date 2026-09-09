# Brief-JSON contract (M2 ↔ M3)

> **FREEZE THIS IN WEEK 1.** The Briefing agent emits this; the web app and the
> Telegram notifier render it. Mirrored in:
> - `packages/api/src/sage_api/schemas/brief.py` (Pydantic)
> - `apps/web/src/lib/types.ts` (TypeScript)
>
> Status: **DRAFT — not final.**

## Top-level shape

```json
{
  "briefing_id": "brief_20260210",
  "generated_at": "2026-02-10T06:00:12Z",
  "run_id": "run_8f21",
  "persona": { "business": "Lian & Co.", "owner": "Mei" },
  "period_covered": { "start": "2026-02-03", "end": "2026-02-09" },
  "headline": "One stockout is quietly costing you ~S$4,200 a week.",
  "items": [ /* BriefItem[], severity-ranked, <= 5 */ ],
  "attention_minutes_estimate": 3
}
```

## `BriefItem`

```json
{
  "id": "item_1",
  "rank": 1,
  "severity": "high",
  "title": "'Linen Throw' stocked out — Textiles revenue down S$4,200",
  "summary": "Supplier SG-Textiles slipped 6 days on PO-4471. The SKU went to zero cover on Tue; you've been backfilling with a pricier substitute, so margin is down too.",
  "dollar_impact": -4200.0,
  "dollar_recoverable": 3100.0,
  "recommended_action": {
    "text": "Expedite PO-4471. Rush fee ~S$180; recovers ~S$3,100 of lost category revenue.",
    "cost": 180.0
  },
  "causal_chain_id": "chain_1",
  "signal_ids": ["sig_0421", "sig_0455", "sig_0470"],
  "cited_metric_ids": ["days_of_cover", "gross_revenue", "gross_margin_pct"],
  "evidence": [
    { "metric_id": "gross_revenue", "dimensions": { "category": "Textiles" },
      "series": [ { "period": "2026-02-01", "value": 1400 }, { "period": "2026-02-09", "value": 900 } ] }
  ]
}
```

`severity`: `"high" | "medium" | "low"`. `evidence[].series` feeds the sparklines.

## `CausalChain` (from the Correlator)

```json
{
  "id": "chain_1",
  "narrative": "Supplier delay → stockout → category revenue drop → margin erosion from substitute → recoverable cash",
  "steps": [
    { "domain": "inventory", "claim": "PO-4471 received 6 days late", "signal_id": "sig_0421", "metric_id": "supplier_lead_time_days" },
    { "domain": "inventory", "claim": "SKU-1183 hit 0 days of cover on 2026-02-09", "signal_id": "sig_0421", "metric_id": "days_of_cover" },
    { "domain": "sales", "claim": "Textiles category revenue -S$4,200 WoW", "signal_id": "sig_0455", "metric_id": "gross_revenue" },
    { "domain": "accounting", "claim": "Gross margin -2.1pts as substitute COGS rose", "signal_id": "sig_0470", "metric_id": "gross_margin_pct" }
  ],
  "dollar_impact": -4200.0,
  "confidence": "high"
}
```

## Rendering rules

- **≤ 5 items** per brief. If detectors produce more, ranking in
  `packages/detectors/runner.py` trims to the top 5 by `score × |dollar_impact|`.
- Every displayed number must map to a `cited_metric_ids` entry (frontend asserts this).
- Telegram render = `headline` + top 3 item `title` + `recommended_action.text`.

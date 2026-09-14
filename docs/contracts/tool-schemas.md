# MCP tool schemas (M1 ↔ M2)

> **FREEZE THIS IN WEEK 1.** Every tool is served by `packages/mcp` (`sage_mcp`)
> over MCP — OpenClaw agents touch Sage data *only* through these, via the `sage`
> MCP server. Once signed, changes go through both M1 and M2. See
> [`../decisions/0003-openclaw-agent-runtime.md`](../decisions/0003-openclaw-agent-runtime.md).
>
> Status: **DRAFT — shapes below are a starting point, not final.** The five read
> tools carry the shape frozen when this contract was still Strands-side; the
> swap to MCP changes *how* they're served, not their input/output shapes.

## `list_metrics()`

Returns the governed catalog so an agent can discover what it may ask for.

```json
{
  "name": "list_metrics",
  "input": {},
  "output": {
    "metrics": [
      {
        "id": "gross_revenue",
        "label": "Gross Revenue",
        "unit": "SGD",
        "grain": ["day", "week", "month"],
        "dimensions": ["channel", "category", "sku", "customer_segment"],
        "direction": "higher_is_better",
        "owner_domain": "sales"
      }
    ]
  }
}
```

## `query_metric(metric_id, dimensions, period, grain)`

The only way to read a number. No raw SQL, ever.

```json
{
  "name": "query_metric",
  "input": {
    "metric_id": "gross_revenue",
    "grain": "day",
    "period": { "start": "2026-02-01", "end": "2026-02-28" },
    "dimensions": { "category": "Textiles" }
  },
  "output": {
    "metric_id": "gross_revenue",
    "unit": "SGD",
    "grain": "day",
    "rows": [
      { "period": "2026-02-01", "dimensions": { "category": "Textiles" }, "value": 1234.5 }
    ]
  }
}
```

## `get_signals(domain?, since?, status?)`

Open anomalies from the `signals` table (written by the deterministic detectors).

```json
{
  "name": "get_signals",
  "input": { "domain": "inventory", "since": "2026-02-01", "status": "open" },
  "output": {
    "signals": [
      {
        "signal_id": "sig_0421",
        "detected_at": "2026-02-10T06:00:00Z",
        "metric_id": "days_of_cover",
        "grain": "day",
        "dimensions": { "sku": "SKU-1183" },
        "period": "2026-02-09",
        "observed": 0.0,
        "expected": 12.4,
        "deviation": -12.4,
        "score": 0.93,
        "dollar_impact_est": -4200.0,
        "detector": "threshold"
      }
    ]
  }
}
```

## `compare_period(metric_id, period_a, period_b, dimensions?)`

Convenience wrapper over `query_metric` for A/B deltas.

```json
{
  "name": "compare_period",
  "input": {
    "metric_id": "gross_margin_pct",
    "period_a": { "start": "2026-01-01", "end": "2026-01-31" },
    "period_b": { "start": "2026-02-01", "end": "2026-02-28" },
    "dimensions": { "category": "Textiles" }
  },
  "output": { "value_a": 42.1, "value_b": 40.0, "delta": -2.1, "unit": "pct_points" }
}
```

## `trace_lineage(metric_id)`

The governance story: show the SQL and source tables behind a metric.

```json
{
  "name": "trace_lineage",
  "input": { "metric_id": "gross_revenue" },
  "output": {
    "metric_id": "gross_revenue",
    "sql": "SELECT SUM(line_total) FROM fact_order_line WHERE {filters}",
    "source_tables": ["fact_order_line", "dim_sku", "dim_channel"],
    "owner_domain": "sales"
  }
}
```

## `save_brief(run_id, brief)`

The write boundary — new with the OpenClaw swap (the old design just hoped the
agent's final text was valid brief-JSON). `sage-briefing` calls this once, as its
terminal tool call. The MCP server validates `brief` against
`sage_shared.types.MorningBrief` before persisting; a malformed payload is a tool
error, not a silent bad response.

```json
{
  "name": "save_brief",
  "input": {
    "run_id": "run_20260214_0600",
    "brief": {
      "as_of_date": "2026-02-14",
      "items": [ /* BriefItem[], ≤5 — see brief-json.md */ ]
    }
  },
  "output": { "brief_id": "brief_20260214_0600" }
}
```

On a validation failure, the tool returns an error describing which field failed
(not the raw Pydantic traceback) so the agent can correct and retry.

## Rules `sage-briefing` must obey

- May only correlate **existing** signals from the `signals` table (via
  `get_signals` / `query_metric` / `compare_period`).
- Must **cite metric IDs** for every number in its output.
- Outputs a **strict schema**, enforced at the `save_brief` call (see
  [`brief-json.md`](brief-json.md) → `causal_chains`) — not a free-form final
  message.

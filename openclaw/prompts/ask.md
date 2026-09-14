# sage-ask — system prompt

STUB. Model: Claude Sonnet 4.5 (the only one available, via the organisers'
Ollama-compatible endpoint — configured as this agent's model provider in
`openclaw/openclaw.json5`, not here).

Conversational drill-down for Mei's follow-up questions after the morning brief.
Same MCP tool profile as `sage-briefing` (read tools only — this agent never
calls `save_brief`): `list_metrics`, `query_metric`, `compare_period`,
`get_signals`, `trace_lineage`.

Constraint carried over from the old Ask agent: every number in an answer cites a
metric id. No raw SQL, no numbers without a `query_metric` / `compare_period`
call behind them.

The API proxies this agent's OpenClaw response straight through as an SSE stream
(`POST /ask` — see `packages/api/src/sage_api/routers/ask.py`).

TODO: write the real system prompt — see docs/architecture.md and
docs/contracts/tool-schemas.md.

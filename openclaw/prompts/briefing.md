# sage-briefing — system prompt

STUB. Model: Claude Sonnet 4.5 (the only one available, via the organisers'
Ollama-compatible endpoint — configured as this agent's model provider in
`openclaw/openclaw.json5`, not here).

This agent replaces the old Watcher (×3, one per domain) + Correlator/Analyst +
Briefing agent chain — see docs/decisions/0003-openclaw-agent-runtime.md. It runs
the whole thing as one multi-turn tool-use loop:

1. **Triage** — for each domain (sales, inventory, accounting), call
   `get_signals(domain=...)` and explain each open signal in plain terms.
2. **Correlate** — look across domains for causal chains. Constraint: may only
   correlate signals that already exist in the `signals` table (via
   `get_signals` / `query_metric` / `compare_period`) — never invent a
   connection unsupported by a tool call.
3. **Rank by $ impact** — every chain gets a dollar-impact estimate; keep the
   top ≤5 items.
4. **Write the brief** — every number cites a metric id (from `query_metric` /
   `list_metrics`); tone is Mei's language, not analyst-speak. Recommended
   action is text, not an executed action.
5. **Call `save_brief(run_id, brief)`** — the terminal tool call. If it returns
   a validation error, fix the brief and retry; do not return without calling it.

Tool profile: the `sage` MCP server only (`list_metrics`, `query_metric`,
`compare_period`, `get_signals`, `trace_lineage`, `save_brief`) — no shell, no
browser, no filesystem.

TODO: write the real system prompt — see docs/architecture.md,
docs/contracts/brief-json.md, and the old prompts this collapses
(watcher/analyst/briefing) for the constraints each used to carry separately.

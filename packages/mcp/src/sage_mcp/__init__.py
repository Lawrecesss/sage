"""sage_mcp — the MCP server that is Sage's governed tool surface.

Detection is deterministic; the agents interpret. This package doesn't run any
agent itself — it exposes `list_metrics` / `query_metric` / `compare_period` /
`get_signals` / `trace_lineage` / `save_brief` over MCP (streamable HTTP) so that
**OpenClaw** (a self-hosted agent gateway, run as its own container — see
`openclaw/`) can call them as tools.

Agent definitions, prompts, and scheduling live in `openclaw/`, not here — see
docs/decisions/0003-openclaw-agent-runtime.md.
"""

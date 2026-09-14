# packages/mcp

The MCP server — Sage's governed tool surface, served to **OpenClaw** (the agent
gateway; see `openclaw/`) over streamable HTTP. This package runs no agent and
calls no LLM itself; it only exposes tools.

Five read tools — `list_metrics` / `query_metric` / `compare_period` /
`get_signals` / `trace_lineage` — carry over the tool-schema contract frozen with
M1 (`docs/contracts/tool-schemas.md`), signatures unchanged. One write tool,
`save_brief`, validates a brief against `sage_shared.types.MorningBrief` before
persisting it — the schema-enforcement point for brief-JSON.

Runs as the `mcp` container: internal docker network only, never published, never
routed by Caddy. See `docs/decisions/0003-openclaw-agent-runtime.md`.

> STUB — structure only, no implementation yet.

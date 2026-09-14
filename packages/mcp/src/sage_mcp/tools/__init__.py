"""MCP tools — the ONLY way OpenClaw agents touch Sage data.

Each module exposes one tool function, registered with the server in
`sage_mcp.server`. Read tools (`list_metrics`, `query_metric`, `compare_period`,
`get_signals`, `trace_lineage`) are the tool-schema contract frozen with M1 — see
docs/contracts/tool-schemas.md. `save_brief` is the write boundary: it validates a
brief against `sage_shared.types.MorningBrief` before persisting it.
"""

"""The MCP server entrypoint — the `mcp` container runs `sage-mcp` (this module's `main()`).

Serves the tools in `sage_mcp.tools` (list_metrics, query_metric, compare_period,
get_signals, trace_lineage, save_brief) over MCP using streamable HTTP, bound to
the internal docker network only (see platform/infra/docker-compose.prod.yml — no published
port; OpenClaw reaches it at `http://mcp:9100/mcp`).

Expected shape (official `mcp` Python SDK / FastMCP):

    from mcp.server.fastmcp import FastMCP
    from sage_mcp.tools import (
        list_metrics, query_metric, compare_period, get_signals, trace_lineage, save_brief,
    )

    def build_server() -> FastMCP:
        server = FastMCP("sage")
        server.add_tool(list_metrics.list_metrics)
        server.add_tool(query_metric.query_metric)
        server.add_tool(compare_period.compare_period)
        server.add_tool(get_signals.get_signals)
        server.add_tool(trace_lineage.trace_lineage)
        server.add_tool(save_brief.save_brief)
        return server

    def main() -> None:
        s = get_settings()
        build_server().run(transport="streamable-http", host=s.mcp_host, port=s.mcp_port)

`main()` is the console-script entrypoint (`sage-mcp`).

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/decisions/0003-openclaw-agent-runtime.md for
what belongs here.
"""


def main() -> None:
    raise NotImplementedError("MCP server — agent/mcp")


if __name__ == "__main__":
    main()

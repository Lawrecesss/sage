"""MCP server entrypoint — the `mcp` container runs `sage-mcp` (this module's `main()`).

Serves two kinds of tools over Streamable HTTP so OpenClaw can connect:
  - list_signals/get_signal: detected anomalies. Still demo data (see demo_data.py) —
    the `signals` table doesn't exist yet; a future detector service owns writing it.
  - list_metrics/query_metric: sage's governed metric layer, backed by real Postgres
    queries against metrics.yaml (see metrics.py) — this one's live, not a stub.
"""

import os
from datetime import UTC, datetime

from fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

from sage_mcp.demo_data import DEMO_SIGNALS
from sage_mcp.metrics import (
    UnknownMetricError,
    UnsupportedDimensionError,
    load_metrics,
    run_metric,
)

mcp = FastMCP(
    name="sage",
    instructions=(
        "Sage's governed tool surface: read-only access to detected signals and "
        "business performance metrics. Always call list_metrics() first if unsure "
        "which metric_id or dimensions are valid — never guess them."
    ),
)


@mcp.tool(annotations={"readOnlyHint": True})
def ping() -> dict:
    """Health probe. Returns server time so a client can confirm the round trip."""
    return {"ok": True, "server": "sage-mcp", "time": datetime.now(UTC).isoformat()}


@mcp.tool(annotations={"readOnlyHint": True})
def list_signals(status: str | None = None, limit: int = 10) -> list[dict]:
    """List detected anomaly signals, highest score first.

    Args:
        status: Optional filter — "open", "acknowledged" or "resolved".
        limit: Maximum number of signals to return.
    """
    rows = [s for s in DEMO_SIGNALS if status is None or s["status"] == status]
    rows.sort(key=lambda s: s["score"], reverse=True)
    return rows[:limit]


@mcp.tool(annotations={"readOnlyHint": True})
def get_signal(signal_id: str) -> dict:
    """Fetch one signal by id."""
    for s in DEMO_SIGNALS:
        if s["signal_id"] == signal_id:
            return s
    raise ValueError(f"unknown signal_id: {signal_id}")


@mcp.tool(annotations={"readOnlyHint": True})
def list_metrics() -> list[dict]:
    """List every governed business-performance metric available to query_metric.

    Returns id, label, description, unit, direction (higher/lower/context_dependent
    is_better), benchmark, valid grains, and which dimensions can be filtered on —
    everything needed to decide which metric answers a question and how to read its
    number, without guessing.
    """
    return [m.summary() for m in load_metrics().values()]


@mcp.tool(annotations={"readOnlyHint": True})
def query_metric(
    metric_id: str,
    period_start: str,
    period_end: str,
    dimensions: dict[str, str] | None = None,
) -> list[dict]:
    """Run one governed metric over a date range, optionally filtered to one value
    per dimension.

    Args:
        metric_id: A metric id from list_metrics().
        period_start: Start of the period, as an ISO date "YYYY-MM-DD" (inclusive).
        period_end: End of the period, as an ISO date "YYYY-MM-DD" (inclusive).
        dimensions: Optional exact-match filters, e.g. {"channel": "online"}. Only
            dimensions list_metrics() marks as filterable for that metric are valid —
            check there first rather than guessing a dimension name.

    Returns a list of rows, each with a "value" key plus any dimension the metric
    itself breaks down by (e.g. category_revenue always returns one row per category).
    Raises an error naming the problem if metric_id or a dimension is invalid — never
    returns a fabricated or partial result.
    """
    try:
        return run_metric(metric_id, dimensions, period_start, period_end)
    except (UnknownMetricError, UnsupportedDimensionError) as e:
        raise ValueError(str(e)) from e


@mcp.resource("sage://about")
def about() -> str:
    """What this server is."""
    return (
        "Sage MCP server — list_metrics/query_metric run real Postgres queries "
        "against the governed metric layer (metrics.yaml); list_signals/get_signal "
        "are still demo data pending a detector service."
    )


@mcp.custom_route("/health", methods=["GET"])
async def health(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


def main() -> None:
    mcp.run(
        transport="http",
        host=os.environ.get("MCP_HOST", "0.0.0.0"),
        port=int(os.environ.get("MCP_PORT", "9100")),
        path=os.environ.get("MCP_PATH", "/mcp"),
    )


if __name__ == "__main__":
    main()

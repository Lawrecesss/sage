"""MCP server entrypoint — the `mcp` container runs `sage-mcp` (this module's `main()`).

Scaffold: serves a few demo tools over Streamable HTTP so OpenClaw can connect.
Tool bodies return canned data shaped like the warehouse `signals` / `briefings`
tables; swap them for real queries once the warehouse is populated.
"""

import os
from datetime import UTC, datetime

from fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

from sage_mcp.demo_data import DEMO_SIGNALS

mcp = FastMCP(
    name="sage",
    instructions="Sage's governed tool surface: read-only access to detected signals and briefings.",
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


@mcp.resource("sage://about")
def about() -> str:
    """What this server is."""
    return "Sage MCP scaffold — demo data only, not connected to the warehouse yet."


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

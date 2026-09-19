"""MCP server entrypoint — the `retail-mcp` container runs `retail-mcp` (this
module's `main()`).

The retail module's MCP server (ARCHITECTURE.md §4): schema-agnostic,
tenant-scoped tools backed by each tenant's own Postgres schema.
"""

import os
from datetime import UTC, date, datetime

from fastmcp import FastMCP
from sqlalchemy import inspect, text
from starlette.requests import Request
from starlette.responses import JSONResponse

from retail_mcp.db import assert_tenant_active, get_engine

mcp = FastMCP(
    name="retail",
    instructions=(
        "Sage's retail module tools. Every tool requires tenant_id — pass it "
        "exactly as given to you in the system message for this conversation. "
        "Call describe_schema first if you don't already know what data this "
        "tenant has."
    ),
)

# metric/group_by are user-influenced (via the LLM) but never string-interpolated
# into SQL directly — only these allowlisted expressions are ever used.
_METRICS = {
    "revenue": "SUM(f.line_total_sgd)",
    "units": "SUM(f.qty)",
    "refunds": "SUM(CASE WHEN f.is_refund THEN f.line_total_sgd ELSE 0 END)",
}
_GROUP_BY = {
    "sku": "f.sku",
    "channel": "f.channel",
    "segment": "f.segment",
    "category": "s.category",
}


@mcp.tool(annotations={"readOnlyHint": True})
def ping() -> dict:
    """Health probe. Returns server time so a client can confirm the round trip."""
    return {"ok": True, "server": "retail-mcp", "time": datetime.now(UTC).isoformat()}


@mcp.tool(annotations={"readOnlyHint": True})
def describe_schema(tenant_id: str) -> dict:
    """Discover what tables/columns exist for this tenant.

    Call this before get_sales_timeseries if you don't already have schema
    context for this tenant/session — don't assume a fixed set of columns.

    Args:
        tenant_id: The tenant to inspect. Pass it exactly as given in the
            system message for this conversation.
    """
    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        inspector = inspect(conn)
        tables = inspector.get_table_names(schema=tenant_id)
        return {
            table: [
                {"name": col["name"], "type": str(col["type"])}
                for col in inspector.get_columns(table, schema=tenant_id)
            ]
            for table in tables
        }


@mcp.tool(annotations={"readOnlyHint": True})
def get_sales_timeseries(
    tenant_id: str,
    metric: str,
    group_by: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    """Daily sales timeseries for a tenant, optionally broken down by a dimension.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        metric: One of "revenue", "units", "refunds".
        group_by: Optional secondary breakdown — one of "sku", "channel",
            "segment", "category". Omit for a plain date timeseries.
        start_date: Optional inclusive start date, "YYYY-MM-DD".
        end_date: Optional inclusive end date, "YYYY-MM-DD".
    """
    if metric not in _METRICS:
        raise ValueError(f"unknown metric {metric!r}: expected one of {sorted(_METRICS)}")
    if group_by is not None and group_by not in _GROUP_BY:
        raise ValueError(f"unknown group_by {group_by!r}: expected one of {sorted(_GROUP_BY)}")
    for label, value in (("start_date", start_date), ("end_date", end_date)):
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{label} must be YYYY-MM-DD, got {value!r}") from exc

    metric_expr = _METRICS[metric]
    group_expr = _GROUP_BY.get(group_by) if group_by else None
    select_cols = "d.date" + (f", {group_expr} AS {group_by}" if group_expr else "")
    group_cols = "d.date" + (f", {group_expr}" if group_expr else "")
    needs_sku_join = group_by == "category"

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = f"""
            SELECT {select_cols}, {metric_expr} AS {metric}
            FROM fact_order_line f
            JOIN dim_date d ON d.date = f.date
            {"JOIN dim_sku s ON s.sku = f.sku" if needs_sku_join else ""}
            WHERE (:start_date IS NULL OR d.date >= CAST(:start_date AS date))
              AND (:end_date IS NULL OR d.date <= CAST(:end_date AS date))
            GROUP BY {group_cols}
            ORDER BY {group_cols}
        """
        rows = conn.execute(text(sql), {"start_date": start_date, "end_date": end_date}).mappings()
        return [dict(row) for row in rows]


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

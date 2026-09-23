"""MCP server entrypoint — the `retail-mcp` container runs `retail-mcp` (this
module's `main()`).

The retail module's MCP server (ARCHITECTURE.md §4): schema-agnostic,
tenant-scoped tools backed by each tenant's own Postgres schema.
"""

import os
from datetime import UTC, date, datetime, timedelta

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
    # unit_cost_sgd is fact_order_line's own snapshot at time of sale, not a
    # dim_sku join — the cost that was actually true when the sale happened.
    "margin": "SUM(f.line_total_sgd) - SUM(f.qty * f.unit_cost_sgd)",
    "margin_pct": "(SUM(f.line_total_sgd) - SUM(f.qty * f.unit_cost_sgd)) / NULLIF(SUM(f.line_total_sgd), 0)",
}
_GROUP_BY = {
    "sku": "f.sku",
    "channel": "f.channel",
    "segment": "f.segment",
    "category": "s.category",
}

# Same allowlist discipline as _METRICS/_GROUP_BY above — fixed literals only,
# never a caller-supplied table/column name.
_INVENTORY_GROUP_BY = {"sku", "category"}
_ACCOUNTS_TABLES = {"receivable": "fact_invoice", "payable": "fact_bill"}
_ACCOUNTS_STATUSES = {"paid", "open"}

# Caps on any tool that can return one row per SKU/bill/etc — a real SME
# catalog can be thousands of rows; nothing here should dump an unbounded
# result into the model's context by default.
_DEFAULT_LIMIT = 50
_MAX_LIMIT = 500

# Fixed, generic judgement thresholds for get_attention_items — not tuned to
# any one tenant's own baseline. See that tool's docstring for the caveat.
_RETURN_RATE_THRESHOLD = 0.08
_SUPPLIER_DELAY_THRESHOLD_DAYS = 5
_OVERDUE_DAYS_THRESHOLD = 60

# Industry-typical (low, high) ranges for get_benchmark_gap_analysis — same
# judgement-context figures quoted in get_sales_timeseries'/get_accounts_status's
# docstrings, centralized here so both places cite the same numbers.
_SALES_BENCHMARKS = {
    "refund_rate": (0.03, 0.08),
    "margin_pct": (0.30, 0.45),
}
_PAYMENT_TERMS_BENCHMARK_DAYS = (14, 30)

_SEASONAL_BREAKDOWN = {
    "day_of_week": "d.dow",
    "month": "d.month",
    "holiday": "d.is_holiday",
}
# dim_date.dow is stored as "Mon".."Sun" text (see simulate/dates.py) — sorts
# alphabetically wrong (Fri, Mon, Sat, ...). This CASE preserves calendar
# order instead. Fixed literals only, safe to interpolate (same discipline
# as _METRICS/_GROUP_BY above).
_WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_WEEKDAY_CASE = "CASE d.dow " + " ".join(
    f"WHEN '{d}' THEN {i}" for i, d in enumerate(_WEEKDAY_ORDER)
) + " END"

_MIN_WINDOW_DAYS = 1
_MAX_WINDOW_DAYS = 180

# get_sku_lifecycle: same +/-20% band used by get_trending_products implicitly
# (its "genuinely rising" cutoff is 0%, this tool needs a symmetric band).
_LIFECYCLE_GROWTH_THRESHOLD = 0.20
_LIFECYCLE_STAGE_PRIORITY = {"dead": 0, "declining": 1, "new": 2, "growing": 3, "stable": 4}

# simulate_reorder_impact: trailing window used to estimate a SKU's average
# daily demand, and the "comfortable" days-of-supply floor after a proposed
# reorder lands.
_DEMAND_WINDOW_DAYS = 60
_LOW_SUPPLY_DAYS_THRESHOLD = 14

# get_cash_flow_forecast: cap on how far out a naive projection is allowed to
# run before it's more noise than signal.
_MAX_FORECAST_HORIZON_DAYS = 90

# get_data_freshness: fixed, trusted expression per table for "the latest
# business-event date this table contains" — none of these tables carry an
# ingest/load timestamp, so this is the closest honest proxy for freshness.
_FRESHNESS_TABLES = {
    "fact_order_line": "date",
    "fact_stock_movement": "date",
    "fact_purchase_order": "GREATEST(ordered_date, expected_date, received_date)",
    "fact_invoice": "COALESCE(paid_date, date)",
    "fact_bill": "COALESCE(paid_date, date)",
}


def _clamp_limit(limit: int) -> int:
    return max(1, min(int(limit), _MAX_LIMIT))


def _period_metric_totals(
    conn, metric: str, group_by: str | None, start_date: str, end_date: str
) -> dict:
    """One period's totals for compare_periods — {group_value: metric_value},
    or {None: total} when group_by is omitted. Assumes the caller already
    validated metric/group_by and set search_path on conn.
    """
    metric_expr = _METRICS[metric]
    group_expr = _GROUP_BY.get(group_by) if group_by else None
    needs_sku_join = group_by == "category"

    sql = f"""
        SELECT {f"{group_expr} AS grp, " if group_expr else ""}COALESCE({metric_expr}, 0) AS value
        FROM fact_order_line f
        {"JOIN dim_sku s ON s.sku = f.sku" if needs_sku_join else ""}
        WHERE f.date BETWEEN CAST(:start_date AS date) AND CAST(:end_date AS date)
        {f"GROUP BY {group_expr}" if group_expr else ""}
    """
    rows = conn.execute(text(sql), {"start_date": start_date, "end_date": end_date}).mappings().all()
    if group_expr:
        return {row["grp"]: row["value"] for row in rows}
    return {None: rows[0]["value"] if rows else 0}


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
        metric: One of "revenue", "units", "refunds", "margin", "margin_pct".
            margin/margin_pct use fact_order_line's own cost snapshot at
            time of sale, not a live dim_sku cost.
        group_by: Optional secondary breakdown — one of "sku", "channel",
            "segment", "category". Omit for a plain date timeseries.
        start_date: Optional inclusive start date, "YYYY-MM-DD".
        end_date: Optional inclusive end date, "YYYY-MM-DD".

    Judgement context, not a target or a sourced figure — rough
    industry-typical ranges for furniture/homeware retail, useful only for
    deciding whether a number looks unusual: refunds are typically 3-8% of
    revenue over the same period; gross margin_pct typically runs 30-45%.
    Values well outside those are worth flagging, not treating as normal.
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
            WHERE (CAST(:start_date AS date) IS NULL OR d.date >= CAST(:start_date AS date))
              AND (CAST(:end_date AS date) IS NULL OR d.date <= CAST(:end_date AS date))
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

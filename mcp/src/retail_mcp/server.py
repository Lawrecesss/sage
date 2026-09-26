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

_ENQUIRY_TOPICS = {
    "order_status",
    "return_refund",
    "stock_availability",
    "billing",
    "product_question",
    "complaint",
}
_ENQUIRY_STATUSES = {"open", "resolved", "escalated"}
# "week" buckets by calendar-week start (DATE_TRUNC), not dim_date.week — that
# column is an ISO week number that resets every January and would collide
# across the two years a 15-month dataset can span.
_ENQUIRY_GROUP_BY = {
    "topic": "e.topic",
    "contact_channel": "e.contact_channel",
    "segment": "e.segment",
    "sku": "e.sku",
    "category": "s.category",
    "week": "DATE_TRUNC('week', e.date)::date",
}
_OPS_AREAS = {"logistics", "supply", "promotions", "finance", "store_ops", "staffing", "systems"}
_OPS_SEVERITIES = {"info", "warning", "critical"}
_OPS_STATUSES = {"open", "resolved"}

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
_ENQUIRY_SURGE_MULTIPLIER = 1.5
_SLOW_FIRST_RESPONSE_HOURS = 24.0

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
    "fact_customer_enquiry": "GREATEST(date, resolved_date)",  # GREATEST ignores NULLs
    "fact_operational_update": "GREATEST(date, resolved_date)",
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


@mcp.tool(annotations={"readOnlyHint": True})
def get_inventory_status(
    tenant_id: str, group_by: str | None = None, limit: int = _DEFAULT_LIMIT
) -> list[dict]:
    """Current stock on hand, optionally broken down by SKU or category.

    fact_stock_movement is an event log (one row per sale/receipt), not a
    snapshot table — "current" means each SKU's most recent on_hand_after row,
    not a plain column read.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        group_by: Optional — "sku" (one row per SKU, most granular) or
            "category" (summed across SKUs in that category). Omit for a
            single total on-hand figure across the whole catalog.
        limit: Only applies when group_by="sku" — max rows returned, lowest
            stock first (the most actionable ones). Default 50, capped at
            500. A real catalog can be thousands of SKUs; this is never
            "all of them" unless you raise it and there are fewer than that.
    """
    if group_by is not None and group_by not in _INVENTORY_GROUP_BY:
        raise ValueError(f"unknown group_by {group_by!r}: expected one of {sorted(_INVENTORY_GROUP_BY)}")
    limit = _clamp_limit(limit)

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        latest_cte = """
            WITH latest AS (
                SELECT DISTINCT ON (sku) sku, on_hand_after
                FROM fact_stock_movement
                ORDER BY sku, date DESC, movement_id DESC
            )
        """
        if group_by is None:
            sql = latest_cte + "SELECT SUM(on_hand_after) AS on_hand FROM latest"
        elif group_by == "sku":
            sql = latest_cte + "SELECT sku, on_hand_after AS on_hand FROM latest ORDER BY on_hand_after ASC, sku LIMIT :limit"
        else:  # "category"
            sql = (
                latest_cte
                + """
                SELECT s.category, SUM(latest.on_hand_after) AS on_hand
                FROM latest
                JOIN dim_sku s ON s.sku = latest.sku
                GROUP BY s.category
                ORDER BY s.category
                """
            )
        rows = conn.execute(text(sql), {"limit": limit}).mappings()
        return [dict(row) for row in rows]


@mcp.tool(annotations={"readOnlyHint": True})
def get_supplier_performance(tenant_id: str, supplier_id: str | None = None) -> list[dict]:
    """Per-supplier delivery performance, derived from purchase orders: average
    lead time (order to receipt) and average delay against the originally
    expected date. A slipping delay often precedes a stockout before it shows
    up in inventory numbers.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        supplier_id: Optional — restrict to one supplier (as returned by this
            tool or describe_schema). Omit for every supplier.

    Judgement context, not a target or a sourced figure: bulky furniture
    shipments typically run 15-45 days lead time depending on origin; an
    avg_delay_days consistently above ~5 days is generally worth flagging to
    the owner, not treated as normal variance.
    """
    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = """
            SELECT
                supplier_id,
                AVG(received_date - ordered_date) AS avg_lead_time_days,
                AVG(received_date - expected_date) AS avg_delay_days,
                COUNT(*) AS po_count
            FROM fact_purchase_order
            WHERE (CAST(:supplier_id AS text) IS NULL OR supplier_id = :supplier_id)
            GROUP BY supplier_id
            ORDER BY supplier_id
        """
        rows = conn.execute(text(sql), {"supplier_id": supplier_id}).mappings()
        return [dict(row) for row in rows]


@mcp.tool(annotations={"readOnlyHint": True})
def get_accounts_status(
    tenant_id: str, kind: str, status: str | None = None, limit: int = _DEFAULT_LIMIT
) -> list[dict]:
    """Outstanding receivables (money owed to the business by credit-paying
    customers) or payables (money the business owes suppliers), with due
    dates so overdue ones are visible.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        kind: "receivable" (customer invoices) or "payable" (supplier bills).
        status: Optional filter — "paid" or "open". Omit for both.
        limit: Max rows returned, oldest due_date first (the most urgent).
            Default 50, capped at 500.

    Judgement context, not a target or a sourced figure: typical payment
    terms in this vertical run net 14-30 days; an open balance still
    outstanding more than ~60 days past its due_date is generally a
    cash-flow risk worth surfacing, not routine.
    """
    if kind not in _ACCOUNTS_TABLES:
        raise ValueError(f"unknown kind {kind!r}: expected one of {sorted(_ACCOUNTS_TABLES)}")
    if status is not None and status not in _ACCOUNTS_STATUSES:
        raise ValueError(f"unknown status {status!r}: expected one of {sorted(_ACCOUNTS_STATUSES)}")
    table = _ACCOUNTS_TABLES[kind]  # fixed literal from the allowlist above, never caller input
    limit = _clamp_limit(limit)

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = f"""
            SELECT due_date, paid_date, amount_sgd, status
            FROM {table}
            WHERE (CAST(:status AS text) IS NULL OR status = :status)
            ORDER BY due_date
            LIMIT :limit
        """
        rows = conn.execute(text(sql), {"status": status, "limit": limit}).mappings()
        return [dict(row) for row in rows]


@mcp.tool(annotations={"readOnlyHint": True})
def get_business_health_summary(
    tenant_id: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """One-call consolidated view across sales, inventory, suppliers,
    accounts, and customer enquiries for a period — the answer to "how are we
    doing" without chaining several separate tool calls. Each figure here is
    still exactly what get_sales_timeseries/get_inventory_status/
    get_supplier_performance/get_accounts_status/get_enquiry_summary would
    return individually; this just runs all five domains together and
    returns one row.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        start_date: Optional inclusive start date, "YYYY-MM-DD", for the
            sales and enquiry figures only (inventory/supplier/accounts/
            open-enquiry/open-ops-update counts are always current-state,
            not period-scoped). Omit for all-time sales and enquiries.
        end_date: Optional inclusive end date, "YYYY-MM-DD".

    Returns one dict: revenue, refunds (sales, for the given period);
    total_on_hand, skus_out_of_stock (inventory, current state);
    worst_supplier_id, worst_supplier_delay_days (current state, null if no
    purchase orders exist yet); receivables_open, payables_open (current
    open balances); enquiry_count, avg_csat (enquiries opened in the period,
    avg_csat null if none of them are resolved yet); open_enquiries (current
    count of open + escalated enquiries, not period-scoped);
    open_critical_ops_updates (current count of unresolved critical
    operational updates). worst_supplier_delay_days null doesn't mean "no
    delay," it means no purchase order data exists to compute one — say so if
    asked, don't read it as zero.
    """
    for label, value in (("start_date", start_date), ("end_date", end_date)):
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{label} must be YYYY-MM-DD, got {value!r}") from exc

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = """
            WITH sales AS (
                SELECT
                    COALESCE(SUM(CASE WHEN NOT is_refund THEN line_total_sgd ELSE 0 END), 0) AS revenue,
                    COALESCE(SUM(CASE WHEN is_refund THEN line_total_sgd ELSE 0 END), 0) AS refunds
                FROM fact_order_line
                WHERE (CAST(:start_date AS date) IS NULL OR date >= CAST(:start_date AS date))
                  AND (CAST(:end_date AS date) IS NULL OR date <= CAST(:end_date AS date))
            ),
            latest_stock AS (
                SELECT DISTINCT ON (sku) sku, on_hand_after
                FROM fact_stock_movement
                ORDER BY sku, date DESC, movement_id DESC
            ),
            inventory AS (
                SELECT
                    COALESCE(SUM(on_hand_after), 0) AS total_on_hand,
                    COUNT(*) FILTER (WHERE on_hand_after <= 0) AS skus_out_of_stock
                FROM latest_stock
            ),
            supplier_delays AS (
                SELECT supplier_id, AVG(received_date - expected_date) AS avg_delay_days
                FROM fact_purchase_order
                GROUP BY supplier_id
            ),
            worst_supplier AS (
                SELECT supplier_id, avg_delay_days
                FROM supplier_delays
                ORDER BY avg_delay_days DESC NULLS LAST
                LIMIT 1
            ),
            receivables AS (
                SELECT COALESCE(SUM(amount_sgd), 0) AS open_amount FROM fact_invoice WHERE status != 'paid'
            ),
            payables AS (
                SELECT COALESCE(SUM(amount_sgd), 0) AS open_amount FROM fact_bill WHERE status != 'paid'
            ),
            enquiries AS (
                SELECT
                    COUNT(*) AS enquiry_count,
                    AVG(csat_score) FILTER (WHERE status = 'resolved') AS avg_csat
                FROM fact_customer_enquiry
                WHERE (CAST(:start_date AS date) IS NULL OR date >= CAST(:start_date AS date))
                  AND (CAST(:end_date AS date) IS NULL OR date <= CAST(:end_date AS date))
            ),
            open_enquiries AS (
                SELECT COUNT(*) AS n FROM fact_customer_enquiry WHERE status IN ('open', 'escalated')
            ),
            open_critical_ops AS (
                SELECT COUNT(*) AS n FROM fact_operational_update
                WHERE status = 'open' AND severity = 'critical'
            )
            SELECT
                sales.revenue,
                sales.refunds,
                inventory.total_on_hand,
                inventory.skus_out_of_stock,
                worst_supplier.supplier_id AS worst_supplier_id,
                worst_supplier.avg_delay_days AS worst_supplier_delay_days,
                receivables.open_amount AS receivables_open,
                payables.open_amount AS payables_open,
                enquiries.enquiry_count,
                enquiries.avg_csat,
                open_enquiries.n AS open_enquiries,
                open_critical_ops.n AS open_critical_ops_updates
            FROM sales
            CROSS JOIN inventory
            LEFT JOIN worst_supplier ON true
            CROSS JOIN receivables
            CROSS JOIN payables
            CROSS JOIN enquiries
            CROSS JOIN open_enquiries
            CROSS JOIN open_critical_ops
        """
        row = conn.execute(text(sql), {"start_date": start_date, "end_date": end_date}).mappings().one()
        return dict(row)


@mcp.tool(annotations={"readOnlyHint": True})
def get_stockout_root_causes(tenant_id: str, limit: int = _DEFAULT_LIMIT) -> list[dict]:
    """For every SKU currently at zero (or negative) stock, shows its
    category and its supplier's average delivery delay — so a stockout can
    be traced back to a slow/late supplier instead of reported in isolation.
    Combines get_inventory_status's current-stock logic with
    get_supplier_performance's delay calculation for exactly the SKUs that
    are actually out of stock right now.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        limit: Max rows returned, worst supplier delay first. Default 50,
            capped at 500.

    Returns one row per out-of-stock SKU, worst supplier delay first.
    supplier_avg_delay_days is null when that supplier has no purchase order
    history yet — a stockout with a null delay isn't necessarily the
    supplier's fault; say so rather than assuming.
    """
    limit = _clamp_limit(limit)
    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = """
            WITH latest AS (
                SELECT DISTINCT ON (sku) sku, on_hand_after
                FROM fact_stock_movement
                ORDER BY sku, date DESC, movement_id DESC
            ),
            zero_stock AS (
                SELECT sku FROM latest WHERE on_hand_after <= 0
            ),
            supplier_delay AS (
                SELECT supplier_id, AVG(received_date - expected_date) AS avg_delay_days
                FROM fact_purchase_order
                GROUP BY supplier_id
            )
            SELECT
                z.sku,
                s.category,
                s.supplier_id,
                sd.avg_delay_days AS supplier_avg_delay_days
            FROM zero_stock z
            JOIN dim_sku s ON s.sku = z.sku
            LEFT JOIN supplier_delay sd ON sd.supplier_id = s.supplier_id
            ORDER BY sd.avg_delay_days DESC NULLS LAST, z.sku
            LIMIT :limit
        """
        rows = conn.execute(text(sql), {"limit": limit}).mappings()
        return [dict(row) for row in rows]


@mcp.tool(annotations={"readOnlyHint": True})
def compare_periods(
    tenant_id: str,
    metric: str,
    current_start: str,
    current_end: str,
    previous_start: str,
    previous_end: str,
    group_by: str | None = None,
) -> list[dict]:
    """Compare a sales metric between two explicit date ranges and compute
    the percent change — turns "is this actually different" into a
    calculated number instead of you eyeballing two separate
    get_sales_timeseries calls yourself.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        metric: One of "revenue", "units", "refunds", "margin", "margin_pct"
            (same allowlist as get_sales_timeseries).
        current_start: Inclusive start date of the period being evaluated,
            "YYYY-MM-DD".
        current_end: Inclusive end date of the period being evaluated.
        previous_start: Inclusive start date of the comparison baseline —
            you choose this explicitly (e.g. the prior equal-length period,
            or the same period a year ago); this tool doesn't infer it.
        previous_end: Inclusive end date of the comparison baseline.
        group_by: Optional — same allowlist as get_sales_timeseries. Compares
            each group's value across the two periods instead of one total.

    Returns one row (or one per group_by value), each with current_value,
    previous_value, and pct_change — sorted by the biggest mover first.
    pct_change is null when previous_value is zero (can't compute a percent
    change from zero) — read that as "no baseline to compare against," not
    as 0% change.
    """
    if metric not in _METRICS:
        raise ValueError(f"unknown metric {metric!r}: expected one of {sorted(_METRICS)}")
    if group_by is not None and group_by not in _GROUP_BY:
        raise ValueError(f"unknown group_by {group_by!r}: expected one of {sorted(_GROUP_BY)}")
    for label, value in (
        ("current_start", current_start),
        ("current_end", current_end),
        ("previous_start", previous_start),
        ("previous_end", previous_end),
    ):
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"{label} must be YYYY-MM-DD, got {value!r}") from exc

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        current = _period_metric_totals(conn, metric, group_by, current_start, current_end)
        previous = _period_metric_totals(conn, metric, group_by, previous_start, previous_end)

    results = []
    for key in sorted(set(current) | set(previous), key=lambda k: (k is None, k)):
        cur_val = float(current.get(key, 0) or 0)
        prev_val = float(previous.get(key, 0) or 0)
        pct_change = None if prev_val == 0 else round((cur_val - prev_val) / prev_val * 100, 2)
        row = {"current_value": cur_val, "previous_value": prev_val, "pct_change": pct_change}
        if group_by:
            row[group_by] = key
        results.append(row)

    results.sort(key=lambda r: r["pct_change"] if r["pct_change"] is not None else -1, reverse=True)
    return results


@mcp.tool(annotations={"readOnlyHint": True})
def get_attention_items(tenant_id: str) -> list[dict]:
    """Deterministic threshold checks across every domain, returned as a
    ranked list of concrete issues — an automated first pass before diving
    into individual tools, not a replacement for judgement.

    Thresholds are fixed, generic values (see each item's "threshold"
    field) — not tuned to this specific tenant's own normal baseline. A
    genuinely unusual-for-THIS-business pattern that stays under a generic
    threshold will NOT appear here. Treat an empty result as "nothing
    crossed a generic threshold," not "everything is definitely fine" —
    still form your own judgement from the other tools when asked a broad
    question.

    Checks: sales return rate (trailing 30 days) > 8% of revenue; any SKU at
    zero/negative stock; supplier average delivery delay > 5 days; an open
    receivable/payable more than 60 days past due; customer enquiry volume
    (trailing 7-day daily rate vs. the prior 28 days) more than 1.5x; average
    enquiry first-response time (trailing 30 days) over 24 hours; any
    escalated enquiry still open; any unresolved critical operational
    update. The last check is real, handled code, but structurally
    unreachable against the current seeded dataset — the generator never
    plants a "critical"-severity update (see data/simulator/src/
    sage_simulator/simulate/operations.py) — so it will only ever fire
    against a live tenant's own data.

    Args:
        tenant_id: The tenant to check. Pass it exactly as given in the
            system message for this conversation.

    Returns a list of dicts (possibly empty), each with: domain, issue,
    value, threshold, dollar_impact_est (null when not computable),
    supplier_id (null unless issue is supplier-related). Sorted by
    dollar_impact_est descending where known, then the rest.
    """
    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        items: list[dict] = []

        row = conn.execute(
            text(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN is_refund THEN line_total_sgd ELSE 0 END), 0) AS refunds,
                    COALESCE(SUM(line_total_sgd), 0) AS revenue
                FROM fact_order_line
                WHERE date >= CURRENT_DATE - INTERVAL '30 days'
                """
            )
        ).mappings().one()
        if row["revenue"] > 0:
            rate = row["refunds"] / row["revenue"]
            if rate > _RETURN_RATE_THRESHOLD:
                items.append(
                    {
                        "domain": "sales",
                        "issue": "return_rate_high",
                        "value": round(rate, 4),
                        "threshold": _RETURN_RATE_THRESHOLD,
                        "dollar_impact_est": round(row["refunds"], 2),
                        "supplier_id": None,
                    }
                )

        row = conn.execute(
            text(
                """
                WITH latest AS (
                    SELECT DISTINCT ON (sku) sku, on_hand_after
                    FROM fact_stock_movement
                    ORDER BY sku, date DESC, movement_id DESC
                )
                SELECT COUNT(*) AS n FROM latest WHERE on_hand_after <= 0
                """
            )
        ).mappings().one()
        if row["n"] > 0:
            items.append(
                {
                    "domain": "inventory",
                    "issue": "skus_out_of_stock",
                    "value": row["n"],
                    "threshold": 0,
                    "dollar_impact_est": None,
                    "supplier_id": None,
                }
            )

        supplier_rows = conn.execute(
            text(
                """
                SELECT supplier_id, AVG(received_date - expected_date) AS avg_delay_days
                FROM fact_purchase_order
                GROUP BY supplier_id
                HAVING AVG(received_date - expected_date) > :threshold
                ORDER BY avg_delay_days DESC
                """
            ),
            {"threshold": _SUPPLIER_DELAY_THRESHOLD_DAYS},
        ).mappings().all()
        for r in supplier_rows:
            items.append(
                {
                    "domain": "suppliers",
                    "issue": "delivery_delay_high",
                    "value": float(r["avg_delay_days"]),
                    "threshold": _SUPPLIER_DELAY_THRESHOLD_DAYS,
                    "dollar_impact_est": None,
                    "supplier_id": r["supplier_id"],
                }
            )

        for kind, table in _ACCOUNTS_TABLES.items():
            row = conn.execute(
                text(
                    f"""
                    SELECT COALESCE(SUM(amount_sgd), 0) AS overdue_amount, COUNT(*) AS n
                    FROM {table}
                    WHERE status != 'paid' AND CURRENT_DATE - due_date > :threshold
                    """
                ),
                {"threshold": _OVERDUE_DAYS_THRESHOLD},
            ).mappings().one()
            if row["n"] > 0:
                items.append(
                    {
                        "domain": "accounts",
                        "issue": f"{kind}_overdue",
                        "value": row["n"],
                        "threshold": _OVERDUE_DAYS_THRESHOLD,
                        "dollar_impact_est": round(row["overdue_amount"], 2),
                        "supplier_id": None,
                    }
                )

        row = conn.execute(
            text(
                """
                WITH recent AS (
                    SELECT COUNT(*) AS n FROM fact_customer_enquiry
                    WHERE date >= CURRENT_DATE - INTERVAL '7 days'
                ),
                prior AS (
                    SELECT COUNT(*) AS n FROM fact_customer_enquiry
                    WHERE date >= CURRENT_DATE - INTERVAL '35 days'
                      AND date < CURRENT_DATE - INTERVAL '7 days'
                )
                SELECT recent.n AS recent_n, prior.n AS prior_n FROM recent CROSS JOIN prior
                """
            )
        ).mappings().one()
        prior_daily_rate = row["prior_n"] / 28
        recent_daily_rate = row["recent_n"] / 7
        if prior_daily_rate > 0 and recent_daily_rate > prior_daily_rate * _ENQUIRY_SURGE_MULTIPLIER:
            items.append(
                {
                    "domain": "customer",
                    "issue": "enquiry_volume_spike",
                    "value": round(recent_daily_rate, 2),
                    "threshold": round(prior_daily_rate * _ENQUIRY_SURGE_MULTIPLIER, 2),
                    "dollar_impact_est": None,
                    "supplier_id": None,
                }
            )

        row = conn.execute(
            text(
                """
                SELECT AVG(first_response_hours) AS avg_hours
                FROM fact_customer_enquiry
                WHERE date >= CURRENT_DATE - INTERVAL '30 days'
                """
            )
        ).mappings().one()
        if row["avg_hours"] is not None and row["avg_hours"] > _SLOW_FIRST_RESPONSE_HOURS:
            items.append(
                {
                    "domain": "customer",
                    "issue": "slow_first_response",
                    "value": round(float(row["avg_hours"]), 1),
                    "threshold": _SLOW_FIRST_RESPONSE_HOURS,
                    "dollar_impact_est": None,
                    "supplier_id": None,
                }
            )

        row = conn.execute(
            text("SELECT COUNT(*) AS n FROM fact_customer_enquiry WHERE status = 'escalated'")
        ).mappings().one()
        if row["n"] > 0:
            items.append(
                {
                    "domain": "customer",
                    "issue": "escalations_open",
                    "value": row["n"],
                    "threshold": 0,
                    "dollar_impact_est": None,
                    "supplier_id": None,
                }
            )

        critical_ops_rows = conn.execute(
            text(
                """
                SELECT supplier_id FROM fact_operational_update
                WHERE status = 'open' AND severity = 'critical'
                """
            )
        ).mappings().all()
        for r in critical_ops_rows:
            items.append(
                {
                    "domain": "operations",
                    "issue": "critical_ops_update_open",
                    "value": 1,
                    "threshold": 0,
                    "dollar_impact_est": None,
                    "supplier_id": r["supplier_id"],
                }
            )

    items.sort(key=lambda i: (i["dollar_impact_est"] is None, -(i["dollar_impact_est"] or 0)))
    return items


@mcp.tool(annotations={"readOnlyHint": True})
def get_benchmark_gap_analysis(
    tenant_id: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    """Compares this tenant's actual sales and accounting outcomes against
    fixed industry-typical benchmark ranges, and reports the gap — how far
    outside the range the actual value falls, and in which direction.

    This is judgement support, not a threshold alarm like
    get_attention_items: a metric sitting "within_benchmark" can still be
    worth discussing, and "above_benchmark" isn't automatically bad (e.g.
    margin_pct above the typical range is a good gap, not a problem — read
    the direction before calling a gap "bad").

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        start_date: Optional inclusive start date, "YYYY-MM-DD", scoping the
            sales metrics only. Accounts metrics use every invoice/bill
            that's ever been paid, not period-scoped — payment behavior
            needs a full sample, not one window.
        end_date: Optional inclusive end date, "YYYY-MM-DD".

    Returns one row per metric:
        domain: "sales" or "accounts".
        metric: "refund_rate", "margin_pct" (sales, both benchmarked against
            this vertical's typical range); "receivable_avg_days_to_settle",
            "payable_avg_days_to_settle" (accounts — average paid_date minus
            issue date, benchmarked against typical net 14-30 day terms).
        actual_value: This tenant's figure, or null if there's no data to
            compute it (e.g. no revenue in the period, or nothing paid yet)
            — the row is still returned so the gap is explicitly "unknown,"
            not silently omitted.
        benchmark_low / benchmark_high: The fixed reference range.
        gap: Signed distance outside the range (0 if inside it, null if
            actual_value is null).
        status: "below_benchmark", "within_benchmark", "above_benchmark", or
            null if actual_value is null.

    For receivables, above_benchmark means customers are paying slower than
    typical terms — a collection risk. For payables, above_benchmark means
    the business is paying suppliers slower than typical terms — that can
    be a deliberate cash-flow choice or a supplier-relationship risk;
    context (get_supplier_performance, get_accounts_status) decides which.
    """
    for label, value in (("start_date", start_date), ("end_date", end_date)):
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{label} must be YYYY-MM-DD, got {value!r}") from exc

    def _gap_status(actual: float | None, lo: float, hi: float) -> tuple[str | None, float | None]:
        if actual is None:
            return None, None
        if actual < lo:
            return "below_benchmark", round(actual - lo, 4)
        if actual > hi:
            return "above_benchmark", round(actual - hi, 4)
        return "within_benchmark", 0.0

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        results: list[dict] = []

        row = conn.execute(
            text(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN is_refund THEN line_total_sgd ELSE 0 END), 0) AS refunds,
                    COALESCE(SUM(line_total_sgd), 0) AS revenue,
                    COALESCE(SUM(line_total_sgd) - SUM(qty * unit_cost_sgd), 0) AS margin
                FROM fact_order_line
                WHERE (CAST(:start_date AS date) IS NULL OR date >= CAST(:start_date AS date))
                  AND (CAST(:end_date AS date) IS NULL OR date <= CAST(:end_date AS date))
                """
            ),
            {"start_date": start_date, "end_date": end_date},
        ).mappings().one()

        revenue = row["revenue"]
        refund_rate = (row["refunds"] / revenue) if revenue else None
        margin_pct = (row["margin"] / revenue) if revenue else None

        for metric, actual in (("refund_rate", refund_rate), ("margin_pct", margin_pct)):
            lo, hi = _SALES_BENCHMARKS[metric]
            status, gap = _gap_status(actual, lo, hi)
            results.append(
                {
                    "domain": "sales",
                    "metric": metric,
                    "actual_value": round(actual, 4) if actual is not None else None,
                    "benchmark_low": lo,
                    "benchmark_high": hi,
                    "gap": gap,
                    "status": status,
                }
            )

        lo, hi = _PAYMENT_TERMS_BENCHMARK_DAYS
        for kind, table in _ACCOUNTS_TABLES.items():
            settle_row = conn.execute(
                text(
                    f"""
                    SELECT AVG(paid_date - date) AS avg_days_to_settle
                    FROM {table}
                    WHERE paid_date IS NOT NULL
                    """
                )
            ).mappings().one()
            avg_days = (
                float(settle_row["avg_days_to_settle"])
                if settle_row["avg_days_to_settle"] is not None
                else None
            )
            status, gap = _gap_status(avg_days, lo, hi)
            results.append(
                {
                    "domain": "accounts",
                    "metric": f"{kind}_avg_days_to_settle",
                    "actual_value": round(avg_days, 1) if avg_days is not None else None,
                    "benchmark_low": lo,
                    "benchmark_high": hi,
                    "gap": gap,
                    "status": status,
                }
            )

    return results


@mcp.tool(annotations={"readOnlyHint": True})
def get_trending_products(
    tenant_id: str,
    metric: str = "units",
    window_days: int = 14,
    as_of_date: str | None = None,
    limit: int = _DEFAULT_LIMIT,
) -> list[dict]:
    """Rising products: per-SKU comparison between the trailing window_days
    and the window_days immediately before it, sorted fastest-growing
    first. Only genuinely rising SKUs are returned — a SKU with zero sales
    in the previous window is excluded entirely (no baseline to call
    "trending" against — a 1-unit blip from zero would otherwise show as an
    undefined or absurd percent change).

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        metric: One of "revenue", "units", "refunds", "margin", "margin_pct"
            (same allowlist as get_sales_timeseries). "units" is usually the
            more honest trending signal — revenue can rise from a price
            change alone, not more people actually buying it.
        window_days: Length of each comparison window, in days (1-180).
            Default 14 — long enough to smooth day-to-day noise, short
            enough to still mean "recent."
        as_of_date: Optional — the date the "current" window ends on
            (inclusive), "YYYY-MM-DD". Defaults to today's real date. Set
            this explicitly when testing against a seeded dataset whose
            calendar doesn't reach today — otherwise the current window is
            empty and every result silently drops out.
        limit: Max SKUs returned. Default 50, capped 500.

    Returns one row per rising SKU: sku, category, current_value,
    previous_value, pct_change — sorted by pct_change descending.
    """
    if metric not in _METRICS:
        raise ValueError(f"unknown metric {metric!r}: expected one of {sorted(_METRICS)}")
    if not (_MIN_WINDOW_DAYS <= window_days <= _MAX_WINDOW_DAYS):
        raise ValueError(f"window_days must be between {_MIN_WINDOW_DAYS} and {_MAX_WINDOW_DAYS}, got {window_days}")
    if as_of_date is not None:
        try:
            date.fromisoformat(as_of_date)
        except ValueError as exc:
            raise ValueError(f"as_of_date must be YYYY-MM-DD, got {as_of_date!r}") from exc
    limit = _clamp_limit(limit)
    metric_expr = _METRICS[metric]

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = f"""
            WITH bounds AS (
                SELECT COALESCE(CAST(:as_of_date AS date), CURRENT_DATE) AS as_of
            ),
            current_period AS (
                SELECT f.sku, COALESCE({metric_expr}, 0) AS value
                FROM fact_order_line f, bounds
                WHERE f.date > bounds.as_of - make_interval(days => :window_days)
                  AND f.date <= bounds.as_of
                GROUP BY f.sku
            ),
            previous_period AS (
                SELECT f.sku, COALESCE({metric_expr}, 0) AS value
                FROM fact_order_line f, bounds
                WHERE f.date > bounds.as_of - make_interval(days => :window_days * 2)
                  AND f.date <= bounds.as_of - make_interval(days => :window_days)
                GROUP BY f.sku
            )
            SELECT
                c.sku,
                s.category,
                c.value AS current_value,
                p.value AS previous_value,
                ROUND((((c.value - p.value)::numeric / p.value) * 100), 2) AS pct_change
            FROM current_period c
            JOIN previous_period p ON p.sku = c.sku
            JOIN dim_sku s ON s.sku = c.sku
            WHERE p.value > 0 AND c.value > p.value
            ORDER BY pct_change DESC
            LIMIT :limit
        """
        rows = conn.execute(
            text(sql), {"as_of_date": as_of_date, "window_days": window_days, "limit": limit}
        ).mappings()
        return [dict(row) for row in rows]


@mcp.tool(annotations={"readOnlyHint": True})
def get_seasonal_pattern(tenant_id: str, metric: str = "revenue", breakdown: str = "month") -> list[dict]:
    """Aggregates a sales metric across the tenant's ENTIRE order history by
    a calendar dimension, to reveal recurring/seasonal patterns rather than
    one period's snapshot. Answers "which day/month is typically strongest"
    and "do holidays actually move the needle for this business."

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        metric: One of "revenue", "units", "refunds", "margin", "margin_pct"
            (same allowlist as get_sales_timeseries).
        breakdown: One of "day_of_week", "month", "holiday".

    Returns one row per bucket (7 for day_of_week, up to 12 for month, 2 for
    holiday: true/false), each with "value" and days_included — how many
    distinct calendar days fed that bucket. A bucket with noticeably fewer
    days_included than the others is a partial period (e.g. the dataset
    starts mid-year), not necessarily a genuinely weaker season — check
    days_included before concluding a dip is real. There's no
    start_date/end_date here deliberately: pattern detection needs the
    full history, not one chosen window — use get_sales_timeseries for a
    single period's number instead.
    """
    if metric not in _METRICS:
        raise ValueError(f"unknown metric {metric!r}: expected one of {sorted(_METRICS)}")
    if breakdown not in _SEASONAL_BREAKDOWN:
        raise ValueError(f"unknown breakdown {breakdown!r}: expected one of {sorted(_SEASONAL_BREAKDOWN)}")

    metric_expr = _METRICS[metric]
    breakdown_expr = _SEASONAL_BREAKDOWN[breakdown]
    order_expr = _WEEKDAY_CASE if breakdown == "day_of_week" else breakdown_expr

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = f"""
            SELECT
                {breakdown_expr} AS bucket,
                COALESCE({metric_expr}, 0) AS value,
                COUNT(DISTINCT f.date) AS days_included
            FROM fact_order_line f
            JOIN dim_date d ON d.date = f.date
            GROUP BY {breakdown_expr}
            ORDER BY {order_expr}
        """
        rows = conn.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


@mcp.tool(annotations={"readOnlyHint": True})
def get_expected_deliveries(
    tenant_id: str,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = _DEFAULT_LIMIT,
) -> list[dict]:
    """Purchase orders whose expected_date falls in a window — the
    forward-looking complement to get_supplier_performance's historical
    averages. Answers "what's due in today/this week," not "how has this
    supplier done historically."

    In the CURRENT dataset every purchase order already has a concrete
    received_date (the simulator only generates completed history, not
    genuinely in-flight orders) — so every row's status will be
    "received_on_time" or "received_late," never "not_yet_received," no
    matter what date range you ask about. Don't present these as orders
    still in transit; they're a historical record of what was due when,
    and whether it arrived on time. A real tenant's live data could have
    genuinely pending orders (nullable received_date) — this tool already
    handles that case correctly if it exists.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        start_date: Optional inclusive start date on expected_date,
            "YYYY-MM-DD". Defaults to today.
        end_date: Optional inclusive end date on expected_date,
            "YYYY-MM-DD". Defaults to start_date (a single day) when
            start_date is given but this is omitted.
        limit: Max rows returned, soonest expected_date first. Default 50,
            capped at 500.

    Returns one row per PO: po_id, sku, supplier_id, expected_date,
    received_date, qty, status ("received_on_time", "received_late", or
    "not_yet_received").
    """
    for label, value in (("start_date", start_date), ("end_date", end_date)):
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{label} must be YYYY-MM-DD, got {value!r}") from exc
    limit = _clamp_limit(limit)

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = """
            WITH bounds AS (
                SELECT
                    COALESCE(CAST(:start_date AS date), CURRENT_DATE) AS start_date,
                    COALESCE(CAST(:end_date AS date), COALESCE(CAST(:start_date AS date), CURRENT_DATE)) AS end_date
            )
            SELECT
                po_id,
                sku,
                supplier_id,
                expected_date,
                received_date,
                qty,
                CASE
                    WHEN received_date IS NULL THEN 'not_yet_received'
                    WHEN received_date <= expected_date THEN 'received_on_time'
                    ELSE 'received_late'
                END AS status
            FROM fact_purchase_order, bounds
            WHERE expected_date BETWEEN bounds.start_date AND bounds.end_date
            ORDER BY expected_date, po_id
            LIMIT :limit
        """
        rows = conn.execute(
            text(sql), {"start_date": start_date, "end_date": end_date, "limit": limit}
        ).mappings()
        return [dict(row) for row in rows]


@mcp.tool(annotations={"readOnlyHint": True})
def get_sku_lifecycle(
    tenant_id: str,
    metric: str = "units",
    window_days: int = 30,
    as_of_date: str | None = None,
    limit: int = _DEFAULT_LIMIT,
) -> list[dict]:
    """Classifies every SKU with sales history into a lifecycle stage —
    "new", "growing", "stable", "declining", or "dead" — based on its own
    trailing trend. Different question than get_trending_products: that
    tool answers "what's moving fast right now" (pace of change, rising
    only); this one answers "what stage is each SKU at" (a durable
    classification covering the whole catalog, including SKUs that have
    gone quiet).

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        metric: One of "revenue", "units", "refunds", "margin", "margin_pct"
            (same allowlist as get_sales_timeseries). "units" (default) is
            usually the more honest signal for lifecycle staging.
        window_days: Length of each comparison window, in days (1-180).
            Default 30. Total lookback is 2x this (current window + the one
            before it).
        as_of_date: Optional — the date the "current" window ends on
            (inclusive), "YYYY-MM-DD". Defaults to today's real date. Set
            this explicitly when testing against a seeded dataset whose
            calendar doesn't reach today.
        limit: Max SKUs returned. Default 50, capped 500.

    Stage definitions (fixed, generic — not tuned to this tenant's own
    catalog-wide growth rate):
        new: first-ever sale falls inside the current window.
        dead: zero activity in the current window but had some previously
            (or was reactivated then went quiet again) — a stockout can
            also cause this; cross-check get_inventory_status before
            assuming demand actually died.
        growing: >=20% up on the previous window, or previous window was
            zero and current isn't (no baseline, but clearly reactivating).
        declining: >=20% down on the previous window.
        stable: within +/-20% of the previous window.

    Returns one row per SKU: sku, category, first_sale_date,
    previous_value, current_value, pct_change (null when the previous
    window was zero), stage. Sorted dead first, then declining (worst
    first), new, growing (best first), stable last — the stages most
    likely to need a decision come first.
    """
    if metric not in _METRICS:
        raise ValueError(f"unknown metric {metric!r}: expected one of {sorted(_METRICS)}")
    if not (_MIN_WINDOW_DAYS <= window_days <= _MAX_WINDOW_DAYS):
        raise ValueError(f"window_days must be between {_MIN_WINDOW_DAYS} and {_MAX_WINDOW_DAYS}, got {window_days}")
    if as_of_date is not None:
        try:
            as_of_obj = date.fromisoformat(as_of_date)
        except ValueError as exc:
            raise ValueError(f"as_of_date must be YYYY-MM-DD, got {as_of_date!r}") from exc
    else:
        as_of_obj = datetime.now(UTC).date()
    limit = _clamp_limit(limit)
    metric_expr = _METRICS[metric]

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = f"""
            WITH bounds AS (
                SELECT COALESCE(CAST(:as_of_date AS date), CURRENT_DATE) AS as_of
            ),
            first_sale AS (
                SELECT sku, MIN(date) AS first_sale_date
                FROM fact_order_line
                GROUP BY sku
            ),
            current_period AS (
                SELECT f.sku, COALESCE({metric_expr}, 0) AS value
                FROM fact_order_line f, bounds
                WHERE f.date > bounds.as_of - make_interval(days => :window_days)
                  AND f.date <= bounds.as_of
                GROUP BY f.sku
            ),
            previous_period AS (
                SELECT f.sku, COALESCE({metric_expr}, 0) AS value
                FROM fact_order_line f, bounds
                WHERE f.date > bounds.as_of - make_interval(days => :window_days * 2)
                  AND f.date <= bounds.as_of - make_interval(days => :window_days)
                GROUP BY f.sku
            )
            SELECT
                fs.sku,
                s.category,
                fs.first_sale_date,
                COALESCE(p.value, 0) AS previous_value,
                COALESCE(c.value, 0) AS current_value,
                CASE WHEN COALESCE(p.value, 0) > 0
                     THEN ROUND((((COALESCE(c.value, 0) - p.value)::numeric / p.value) * 100), 2)
                     ELSE NULL
                END AS pct_change
            FROM first_sale fs
            JOIN dim_sku s ON s.sku = fs.sku
            LEFT JOIN current_period c ON c.sku = fs.sku
            LEFT JOIN previous_period p ON p.sku = fs.sku
        """
        rows = conn.execute(
            text(sql), {"as_of_date": as_of_date, "window_days": window_days}
        ).mappings()

        results = []
        window_start = as_of_obj - timedelta(days=window_days)
        for row in rows:
            d = dict(row)
            first_sale_date = d["first_sale_date"]
            current = d["current_value"] or 0
            previous = d["previous_value"] or 0
            pct = d["pct_change"]

            if first_sale_date is not None and first_sale_date > window_start:
                stage = "new"
            elif current == 0:
                stage = "dead"
            elif previous == 0 or (pct is not None and pct >= _LIFECYCLE_GROWTH_THRESHOLD * 100):
                stage = "growing"
            elif pct is not None and pct <= -_LIFECYCLE_GROWTH_THRESHOLD * 100:
                stage = "declining"
            else:
                stage = "stable"

            d["stage"] = stage
            results.append(d)

        results.sort(
            key=lambda r: (
                _LIFECYCLE_STAGE_PRIORITY[r["stage"]],
                -(abs(r["pct_change"]) if r["pct_change"] is not None else 0),
            )
        )
        return results[:limit]


@mcp.tool(annotations={"readOnlyHint": True})
def get_channel_performance(
    tenant_id: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    """Sales channels (e.g. store, online, click-and-collect) side by side
    for a period, so a channel-level swing is visible as its own view
    instead of something you'd have to notice inside a get_sales_timeseries
    group_by="channel" breakdown.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        start_date: Optional inclusive start date, "YYYY-MM-DD". Omit for
            all-time.
        end_date: Optional inclusive end date, "YYYY-MM-DD".

    Returns one row per channel: channel, order_count, revenue, units,
    refunds, avg_order_value (revenue / order_count), refund_rate
    (refunds / revenue, null if no revenue), avg_units_per_order — sorted
    revenue descending.

    IMPORTANT caveat on avg_units_per_order: this dataset models one order
    as exactly one order line (a single SKU per order — see
    sage_simulator/simulate/sales.py), so there's no real multi-item basket
    to compute a true cross-sell "attach rate" from. avg_units_per_order
    (quantity per order, not distinct SKUs per order) is the closest honest
    proxy available from this schema — don't present it as basket
    diversity or cross-sell rate.
    """
    for label, value in (("start_date", start_date), ("end_date", end_date)):
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{label} must be YYYY-MM-DD, got {value!r}") from exc

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = """
            SELECT
                channel,
                COUNT(DISTINCT order_id) AS order_count,
                COALESCE(SUM(line_total_sgd), 0) AS revenue,
                COALESCE(SUM(qty), 0) AS units,
                COALESCE(SUM(CASE WHEN is_refund THEN line_total_sgd ELSE 0 END), 0) AS refunds,
                ROUND(
                    (COALESCE(SUM(line_total_sgd), 0) / NULLIF(COUNT(DISTINCT order_id), 0))::numeric, 2
                ) AS avg_order_value,
                ROUND(
                    (COALESCE(SUM(CASE WHEN is_refund THEN line_total_sgd ELSE 0 END), 0)
                        / NULLIF(SUM(line_total_sgd), 0))::numeric, 4
                ) AS refund_rate,
                ROUND(
                    (COALESCE(SUM(qty), 0)::numeric / NULLIF(COUNT(DISTINCT order_id), 0)), 2
                ) AS avg_units_per_order
            FROM fact_order_line
            WHERE (CAST(:start_date AS date) IS NULL OR date >= CAST(:start_date AS date))
              AND (CAST(:end_date AS date) IS NULL OR date <= CAST(:end_date AS date))
            GROUP BY channel
            ORDER BY revenue DESC
        """
        rows = conn.execute(text(sql), {"start_date": start_date, "end_date": end_date}).mappings()
        return [dict(row) for row in rows]


@mcp.tool(annotations={"readOnlyHint": True})
def get_cash_flow_forecast(
    tenant_id: str,
    horizon_days: int = 30,
    as_of_date: str | None = None,
) -> dict:
    """Naive short-horizon cash flow projection — turns the accounts
    pillar from "here's what happened" into "here's what's coming," by
    combining two very different kinds of number: obligations that are
    already known (open receivables/payables with a due_date inside the
    horizon — exact, not projected) and new sales revenue extrapolated
    from historical day-of-week averages (seasonal-adjusted only by
    weekday, genuinely projected, not exact).

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        horizon_days: How many days ahead to project, 1-90. Default 30.
        as_of_date: Optional start date for the horizon, "YYYY-MM-DD".
            Defaults to today's real date — set this explicitly when
            testing against a seeded dataset whose calendar doesn't reach
            today, since due_date filtering depends on it.

    Returns one dict: as_of_date, horizon_end_date,
    receivables_due_in_window (exact, sum of open invoice amounts due in
    the horizon), payables_due_in_window (exact, sum of open bill amounts
    due in the horizon), projected_new_sales_revenue (naive, weekday-average
    extrapolation), net_projected_cash_flow (receivables_due_in_window +
    projected_new_sales_revenue - payables_due_in_window).

    Real limitations, stated plainly rather than hidden in the number:
    this schema has no cash-balance table, so there's no starting balance
    and this is a net FLOW over the horizon, not an ending balance.
    projected_new_sales_revenue treats all new sales as immediate cash —
    it does not model credit-segment orders becoming a future receivable
    instead of cash today. Seasonality here is day-of-week only, not
    monthly or holiday-aware. Treat this as a directional estimate, not a
    number to plan payroll against.
    """
    if not (1 <= horizon_days <= _MAX_FORECAST_HORIZON_DAYS):
        raise ValueError(f"horizon_days must be between 1 and {_MAX_FORECAST_HORIZON_DAYS}, got {horizon_days}")
    if as_of_date is not None:
        try:
            date.fromisoformat(as_of_date)
        except ValueError as exc:
            raise ValueError(f"as_of_date must be YYYY-MM-DD, got {as_of_date!r}") from exc

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = """
            WITH bounds AS (
                SELECT
                    COALESCE(CAST(:as_of_date AS date), CURRENT_DATE) AS as_of,
                    COALESCE(CAST(:as_of_date AS date), CURRENT_DATE)
                        + make_interval(days => :horizon_days) AS horizon_end
            ),
            daily_revenue AS (
                SELECT date, SUM(line_total_sgd) AS revenue
                FROM fact_order_line
                GROUP BY date
            ),
            weekday_avg AS (
                SELECT EXTRACT(DOW FROM date)::int AS dow, AVG(revenue) AS avg_revenue
                FROM daily_revenue
                GROUP BY EXTRACT(DOW FROM date)::int
            ),
            horizon AS (
                SELECT gs::date AS d
                FROM bounds, generate_series(bounds.as_of + 1, bounds.horizon_end, '1 day') AS gs
            ),
            projected AS (
                SELECT COALESCE(SUM(w.avg_revenue), 0) AS projected_revenue
                FROM horizon h
                LEFT JOIN weekday_avg w ON w.dow = EXTRACT(DOW FROM h.d)::int
            ),
            receivables AS (
                SELECT COALESCE(SUM(amount_sgd), 0) AS amt
                FROM fact_invoice, bounds
                WHERE status != 'paid' AND due_date BETWEEN bounds.as_of AND bounds.horizon_end
            ),
            payables AS (
                SELECT COALESCE(SUM(amount_sgd), 0) AS amt
                FROM fact_bill, bounds
                WHERE status != 'paid' AND due_date BETWEEN bounds.as_of AND bounds.horizon_end
            )
            SELECT
                bounds.as_of AS as_of_date,
                bounds.horizon_end AS horizon_end_date,
                projected.projected_revenue,
                receivables.amt AS receivables_due_in_window,
                payables.amt AS payables_due_in_window
            FROM bounds, projected, receivables, payables
        """
        row = conn.execute(
            text(sql), {"as_of_date": as_of_date, "horizon_days": horizon_days}
        ).mappings().one()

        projected_revenue = round(row["projected_revenue"], 2)
        receivables = round(row["receivables_due_in_window"], 2)
        payables = round(row["payables_due_in_window"], 2)
        return {
            "as_of_date": row["as_of_date"],
            "horizon_end_date": row["horizon_end_date"],
            "receivables_due_in_window": receivables,
            "payables_due_in_window": payables,
            "projected_new_sales_revenue": projected_revenue,
            "net_projected_cash_flow": round(receivables + projected_revenue - payables, 2),
        }


@mcp.tool(annotations={"readOnlyHint": True})
def simulate_reorder_impact(
    tenant_id: str,
    sku: str,
    proposed_qty: int,
    order_date: str | None = None,
) -> dict:
    """What-if estimate for a proposed purchase order: given a quantity and
    order date, projects the resulting days-of-supply and stockout risk —
    an actionable answer ("order 400 units now and you're still fine until
    it lands"), not just an alert that something's already wrong. This
    does not create or modify any purchase order; it's a read-only
    simulation.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        sku: The SKU to evaluate. Must exist in this tenant's catalog.
        proposed_qty: Units in the proposed order. Must be positive.
        order_date: Optional date the order would be placed, "YYYY-MM-DD".
            Defaults to today's real date. Only used as the anchor for the
            projected arrival date (order_date + this supplier's average
            lead time) — it doesn't affect the demand-rate estimate below.

    Method (naive, linear — stated so the estimate isn't mistaken for a
    precise forecast): average daily demand is this SKU's trailing
    60-day average units/day (ending at the latest date this tenant's
    sales data actually reaches, not necessarily today — avoids the
    seeded-dataset-calendar trap other date-window tools have). Expected
    lead time is this SKU's supplier's historical average
    (received_date - ordered_date) across all their POs, not anything
    specific to this proposed order. Demand is assumed constant
    (no seasonality, no promo effects) between now and arrival.

    Returns: sku, category, supplier_id, current_on_hand,
    avg_daily_demand, demand_window_days, avg_supplier_lead_time_days
    (null if the supplier has no PO history — see stockout_risk in that
    case), order_date, expected_arrival_date (null if lead time is
    unknown), projected_on_hand_at_arrival (can go negative — a negative
    value is the estimated stockout size before the order lands, floored
    at 0 for the supply-after-receipt calculation), on_hand_after_receipt,
    days_of_supply_after_receipt, stockout_risk: "high" (projected to run
    out before the order arrives), "moderate" (arrives in time but leaves
    less than 14 days of supply), "low" (comfortable), or
    "insufficient_data" (no recent demand, or no supplier PO history, to
    estimate from).
    """
    if proposed_qty <= 0:
        raise ValueError(f"proposed_qty must be positive, got {proposed_qty}")
    if order_date is not None:
        try:
            order_date_obj = date.fromisoformat(order_date)
        except ValueError as exc:
            raise ValueError(f"order_date must be YYYY-MM-DD, got {order_date!r}") from exc
    else:
        order_date_obj = datetime.now(UTC).date()

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sku_row = conn.execute(
            text("SELECT category, supplier_id FROM dim_sku WHERE sku = :sku"), {"sku": sku}
        ).mappings().one_or_none()
        if sku_row is None:
            raise ValueError(f"unknown sku {sku!r} for tenant {tenant_id!r}")

        stock_row = conn.execute(
            text(
                """
                SELECT on_hand_after FROM fact_stock_movement
                WHERE sku = :sku
                ORDER BY date DESC, movement_id DESC
                LIMIT 1
                """
            ),
            {"sku": sku},
        ).mappings().one_or_none()
        current_on_hand = stock_row["on_hand_after"] if stock_row is not None else 0

        demand_row = conn.execute(
            text(
                """
                WITH latest AS (SELECT MAX(date) AS latest_date FROM fact_order_line)
                SELECT
                    COALESCE(SUM(f.qty), 0) AS total_units
                FROM fact_order_line f, latest
                WHERE f.sku = :sku
                  AND NOT f.is_refund
                  AND f.date > latest.latest_date - make_interval(days => :window)
                  AND f.date <= latest.latest_date
                """
            ),
            {"sku": sku, "window": _DEMAND_WINDOW_DAYS},
        ).mappings().one()
        avg_daily_demand = demand_row["total_units"] / _DEMAND_WINDOW_DAYS

        lead_time_row = conn.execute(
            text(
                """
                SELECT AVG(received_date - ordered_date) AS avg_lead_time
                FROM fact_purchase_order
                WHERE supplier_id = :supplier_id
                """
            ),
            {"supplier_id": sku_row["supplier_id"]},
        ).mappings().one()
        avg_lead_time = (
            float(lead_time_row["avg_lead_time"]) if lead_time_row["avg_lead_time"] is not None else None
        )

        result = {
            "sku": sku,
            "category": sku_row["category"],
            "supplier_id": sku_row["supplier_id"],
            "current_on_hand": current_on_hand,
            "avg_daily_demand": round(avg_daily_demand, 2),
            "demand_window_days": _DEMAND_WINDOW_DAYS,
            "avg_supplier_lead_time_days": round(avg_lead_time, 1) if avg_lead_time is not None else None,
            "order_date": order_date_obj.isoformat(),
        }

        if avg_daily_demand <= 0 or avg_lead_time is None:
            result.update(
                {
                    "expected_arrival_date": None,
                    "projected_on_hand_at_arrival": None,
                    "on_hand_after_receipt": None,
                    "days_of_supply_after_receipt": None,
                    "stockout_risk": "insufficient_data",
                }
            )
            return result

        expected_arrival_date = order_date_obj + timedelta(days=round(avg_lead_time))
        projected_on_hand_at_arrival = current_on_hand - avg_daily_demand * avg_lead_time
        on_hand_after_receipt = max(projected_on_hand_at_arrival, 0) + proposed_qty
        days_of_supply_after_receipt = on_hand_after_receipt / avg_daily_demand

        if projected_on_hand_at_arrival < 0:
            risk = "high"
        elif days_of_supply_after_receipt < _LOW_SUPPLY_DAYS_THRESHOLD:
            risk = "moderate"
        else:
            risk = "low"

        result.update(
            {
                "expected_arrival_date": expected_arrival_date.isoformat(),
                "projected_on_hand_at_arrival": round(projected_on_hand_at_arrival, 1),
                "on_hand_after_receipt": round(on_hand_after_receipt, 1),
                "days_of_supply_after_receipt": round(days_of_supply_after_receipt, 1),
                "stockout_risk": risk,
            }
        )
        return result


@mcp.tool(annotations={"readOnlyHint": True})
def get_enquiry_summary(
    tenant_id: str,
    group_by: str = "topic",
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    """Customer enquiry volume and outcomes, grouped by a dimension — the
    enquiry-side equivalent of get_sales_timeseries. Answers "what are
    customers contacting us about" and "how well are we handling it," not
    just a raw ticket count.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        group_by: One of "topic" (default), "contact_channel", "segment",
            "sku", "category" (joins dim_sku), or "week" (calendar week
            starting Monday, labeled by that week's start date).
        start_date: Optional inclusive start date on the enquiry's opened
            date, "YYYY-MM-DD". Omit for all-time.
        end_date: Optional inclusive end date, "YYYY-MM-DD".

    Returns one row per group: the group column (named after group_by),
    enquiry_count, open_count, escalated_count, avg_first_response_hours,
    avg_resolution_days (resolved enquiries only, null if none resolved),
    avg_csat (resolved only, null if none resolved). Sorted by enquiry_count
    descending, except group_by="week" which sorts chronologically.

    Judgement context, not a target or a sourced figure: a first response
    under ~24 hours and an average CSAT of ~4 or higher are typical for this
    vertical; any escalated_count above zero is worth a look regardless of
    volume.
    """
    if group_by not in _ENQUIRY_GROUP_BY:
        raise ValueError(f"unknown group_by {group_by!r}: expected one of {sorted(_ENQUIRY_GROUP_BY)}")
    for label, value in (("start_date", start_date), ("end_date", end_date)):
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{label} must be YYYY-MM-DD, got {value!r}") from exc

    group_expr = _ENQUIRY_GROUP_BY[group_by]
    needs_sku_join = group_by == "category"
    order_expr = "grp" if group_by == "week" else "enquiry_count DESC"

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = f"""
            SELECT
                {group_expr} AS grp,
                COUNT(*) AS enquiry_count,
                COUNT(*) FILTER (WHERE e.status = 'open') AS open_count,
                COUNT(*) FILTER (WHERE e.status = 'escalated') AS escalated_count,
                AVG(e.first_response_hours) AS avg_first_response_hours,
                AVG(e.resolved_date - e.date) FILTER (WHERE e.status = 'resolved') AS avg_resolution_days,
                AVG(e.csat_score) FILTER (WHERE e.status = 'resolved') AS avg_csat
            FROM fact_customer_enquiry e
            {"JOIN dim_sku s ON s.sku = e.sku" if needs_sku_join else ""}
            WHERE (CAST(:start_date AS date) IS NULL OR e.date >= CAST(:start_date AS date))
              AND (CAST(:end_date AS date) IS NULL OR e.date <= CAST(:end_date AS date))
            GROUP BY {group_expr}
            ORDER BY {order_expr}
        """
        rows = conn.execute(text(sql), {"start_date": start_date, "end_date": end_date}).mappings()
        return [
            {group_by: row["grp"], **{k: v for k, v in dict(row).items() if k != "grp"}} for row in rows
        ]


@mcp.tool(annotations={"readOnlyHint": True})
def get_customer_enquiries(
    tenant_id: str,
    topic: str | None = None,
    status: str | None = None,
    sku: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = _DEFAULT_LIMIT,
) -> list[dict]:
    """Individual customer enquiries, most actionable first — the enquiry-side
    equivalent of get_accounts_status. Use get_enquiry_summary for aggregate
    volume/outcome questions; use this tool when the owner wants to see the
    actual tickets (e.g. "what are the open ones about").

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        topic: Optional filter — one of "order_status", "return_refund",
            "stock_availability", "billing", "product_question", "complaint".
            Omit for every topic.
        status: Optional filter — "open", "resolved", or "escalated". Omit
            for all statuses.
        sku: Optional filter to one SKU.
        start_date: Optional inclusive start date on the enquiry's opened
            date, "YYYY-MM-DD". Omit for all-time.
        end_date: Optional inclusive end date, "YYYY-MM-DD".
        limit: Max rows returned. Default 50, capped at 500.

    Returns one row per enquiry: enquiry_id, date, contact_channel, segment,
    topic, order_id (null if not tied to an order), sku (null if not
    product-specific), priority, status, first_response_hours, resolved_date
    (null if not yet resolved), csat_score (null unless resolved). Sorted
    escalated -> open -> resolved, then high priority first, then oldest
    first within each group.
    """
    if topic is not None and topic not in _ENQUIRY_TOPICS:
        raise ValueError(f"unknown topic {topic!r}: expected one of {sorted(_ENQUIRY_TOPICS)}")
    if status is not None and status not in _ENQUIRY_STATUSES:
        raise ValueError(f"unknown status {status!r}: expected one of {sorted(_ENQUIRY_STATUSES)}")
    for label, value in (("start_date", start_date), ("end_date", end_date)):
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{label} must be YYYY-MM-DD, got {value!r}") from exc
    limit = _clamp_limit(limit)

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = """
            SELECT
                enquiry_id, date, contact_channel, segment, topic, order_id, sku,
                priority, status, first_response_hours, resolved_date, csat_score
            FROM fact_customer_enquiry
            WHERE (CAST(:topic AS text) IS NULL OR topic = :topic)
              AND (CAST(:status AS text) IS NULL OR status = :status)
              AND (CAST(:sku AS text) IS NULL OR sku = :sku)
              AND (CAST(:start_date AS date) IS NULL OR date >= CAST(:start_date AS date))
              AND (CAST(:end_date AS date) IS NULL OR date <= CAST(:end_date AS date))
            ORDER BY
                CASE status WHEN 'escalated' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,
                CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                date
            LIMIT :limit
        """
        rows = conn.execute(
            text(sql),
            {
                "topic": topic,
                "status": status,
                "sku": sku,
                "start_date": start_date,
                "end_date": end_date,
                "limit": limit,
            },
        ).mappings()
        return [dict(row) for row in rows]


@mcp.tool(annotations={"readOnlyHint": True})
def get_operational_updates(
    tenant_id: str,
    area: str | None = None,
    severity: str | None = None,
    status: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = _DEFAULT_LIMIT,
) -> list[dict]:
    """The internal operations log — notices staff logged about supply,
    logistics, promotions, finance, store operations, staffing, and systems.
    This is a curated log, not full visibility into every operational event:
    it will not mention every anomaly visible in the business's other data,
    and an empty result doesn't mean nothing happened — only that nothing was
    logged.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.
        area: Optional filter — one of "logistics", "supply", "promotions",
            "finance", "store_ops", "staffing", "systems". Omit for every area.
        severity: Optional filter — "info", "warning", or "critical". Omit
            for all severities.
        status: Optional filter — "open" or "resolved". Omit for both.
        start_date: Optional inclusive start date, "YYYY-MM-DD". Omit for
            all-time.
        end_date: Optional inclusive end date, "YYYY-MM-DD".
        limit: Max rows returned, newest first. Default 50, capped at 500.

    Returns one row per update: update_id, date, area, severity, title,
    detail, supplier_id (null unless supplier-related), channel (null unless
    channel-related), category (null unless category-related), status,
    resolved_date (null if still open).
    """
    if area is not None and area not in _OPS_AREAS:
        raise ValueError(f"unknown area {area!r}: expected one of {sorted(_OPS_AREAS)}")
    if severity is not None and severity not in _OPS_SEVERITIES:
        raise ValueError(f"unknown severity {severity!r}: expected one of {sorted(_OPS_SEVERITIES)}")
    if status is not None and status not in _OPS_STATUSES:
        raise ValueError(f"unknown status {status!r}: expected one of {sorted(_OPS_STATUSES)}")
    for label, value in (("start_date", start_date), ("end_date", end_date)):
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{label} must be YYYY-MM-DD, got {value!r}") from exc
    limit = _clamp_limit(limit)

    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        sql = """
            SELECT
                update_id, date, area, severity, title, detail,
                supplier_id, channel, category, status, resolved_date
            FROM fact_operational_update
            WHERE (CAST(:area AS text) IS NULL OR area = :area)
              AND (CAST(:severity AS text) IS NULL OR severity = :severity)
              AND (CAST(:status AS text) IS NULL OR status = :status)
              AND (CAST(:start_date AS date) IS NULL OR date >= CAST(:start_date AS date))
              AND (CAST(:end_date AS date) IS NULL OR date <= CAST(:end_date AS date))
            ORDER BY date DESC
            LIMIT :limit
        """
        rows = conn.execute(
            text(sql),
            {
                "area": area,
                "severity": severity,
                "status": status,
                "start_date": start_date,
                "end_date": end_date,
                "limit": limit,
            },
        ).mappings()
        return [dict(row) for row in rows]


@mcp.tool(annotations={"readOnlyHint": True})
def get_data_freshness(tenant_id: str) -> list[dict]:
    """How current each source table's data is — "can I trust this number
    right now." None of these tables carry an ingest/load timestamp, so
    this reports the latest business-event date each table actually
    contains (e.g. the newest sale, stock movement, or paid/due date), not
    a literal pipeline freshness metric. Against a seeded demo dataset with
    a fixed historical calendar, every table will report a fixed, possibly
    old, last date — that's expected for demo data, not a real staleness
    problem; for a live tenant's real feed, a table lagging noticeably
    behind the others here IS the actionable signal.

    Args:
        tenant_id: The tenant to query. Pass it exactly as given in the
            system message for this conversation.

    Returns one row per source table: table, last_business_date,
    days_since (CURRENT_DATE - last_business_date; can be large/misleading
    against seeded demo data with a fixed past calendar — see above),
    row_count. Sorted stalest first (largest days_since).
    """
    engine = get_engine()
    with engine.connect() as conn:
        assert_tenant_active(conn, tenant_id)
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))

        results = []
        for table, date_expr in _FRESHNESS_TABLES.items():
            row = conn.execute(
                text(
                    f"""
                    SELECT MAX({date_expr}) AS last_date, COUNT(*) AS row_count
                    FROM {table}
                    """
                )
            ).mappings().one()
            last_date = row["last_date"]
            results.append(
                {
                    "table": table,
                    "last_business_date": last_date,
                    "days_since": (datetime.now(UTC).date() - last_date).days if last_date is not None else None,
                    "row_count": row["row_count"],
                }
            )

    results.sort(key=lambda r: (r["days_since"] is None, -(r["days_since"] or 0)))
    return results


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

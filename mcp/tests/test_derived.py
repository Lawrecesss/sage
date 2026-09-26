"""get_business_health_summary, get_attention_items, get_benchmark_gap_analysis,
get_trending_products, get_sku_lifecycle, simulate_reorder_impact, get_data_freshness.

These combine sales/inventory/supplier/accounts data or apply fixed judgement
thresholds, so each fixture SKU/supplier/invoice/bill below was deliberately
engineered (see fixtures.py's own comments) to land on a specific branch —
tests assert against that specific, intended branch rather than just "some
list/dict comes back".
"""

from __future__ import annotations

from datetime import date

import pytest
from fixtures import (
    ATTENTION_ENQUIRY_SURGE_PRIOR,
    ATTENTION_ENQUIRY_SURGE_RECENT,
    BILLS,
    CURRENT_ON_HAND,
    ENQUIRIES,
    INVOICES,
    ORDER_LINES,
    REF_DATE,
    TENANT_ID,
    TODAY,
    WINDOW_DAYS,
    in_range,
)

from retail_mcp.server import (
    get_accounts_status,
    get_attention_items,
    get_benchmark_gap_analysis,
    get_business_health_summary,
    get_customer_enquiries,
    get_data_freshness,
    get_inventory_status,
    get_sales_timeseries,
    get_sku_lifecycle,
    get_trending_products,
    simulate_reorder_impact,
)

FULL_RANGE = ("2025-01-01", "2025-07-15")
_FULL_RANGE_DATES = (date(2025, 1, 1), date(2025, 7, 15))


# --- get_business_health_summary ---------------------------------------------------


def test_business_health_summary_bad_date_raises():
    with pytest.raises(ValueError, match="start_date"):
        get_business_health_summary(TENANT_ID, start_date="bogus")


def test_business_health_summary_matches_the_individual_tools():
    # The docstring promises these are exactly what the individual tools
    # would return for the same period — true for refunds/inventory/supplier/
    # accounts (checked below), but NOT for "revenue": this tool's own SQL
    # excludes refund lines ("CASE WHEN NOT is_refund THEN line_total_sgd"),
    # while get_sales_timeseries's shared _METRICS["revenue"] sums every row
    # unconditionally, refunds included (see fixtures.py's module docstring).
    # That's a real inconsistency between the two tools, not a fixture
    # mistake — asserted here against an independent fixture computation of
    # THIS tool's actual (net-of-refunds) definition, not the other tool's.
    summary = get_business_health_summary(TENANT_ID, start_date=FULL_RANGE[0], end_date=FULL_RANGE[1])

    ranged = in_range(ORDER_LINES, *_FULL_RANGE_DATES)
    expected_revenue_net_of_refunds = round(sum(r["line_total_sgd"] for r in ranged if not r["is_refund"]), 2)
    assert round(summary["revenue"], 2) == expected_revenue_net_of_refunds

    refund_rows = get_sales_timeseries(TENANT_ID, metric="refunds", start_date=FULL_RANGE[0], end_date=FULL_RANGE[1])
    assert round(summary["refunds"], 2) == round(sum(r["refunds"] for r in refund_rows), 2)

    inventory_total = get_inventory_status(TENANT_ID)[0]["on_hand"]
    assert summary["total_on_hand"] == inventory_total

    tracked_zero_stock = {sku for sku, on_hand in CURRENT_ON_HAND.items() if on_hand <= 0 and sku != "SKU-VASE-1"}
    assert summary["skus_out_of_stock"] == len(tracked_zero_stock)

    assert summary["worst_supplier_id"] == "SUP-SLOW"  # highest avg_delay_days (10)
    assert float(summary["worst_supplier_delay_days"]) == 10.0

    open_receivables = get_accounts_status(TENANT_ID, kind="receivable", status="open", limit=500)
    open_payables = get_accounts_status(TENANT_ID, kind="payable", status="open", limit=500)
    assert round(summary["receivables_open"], 2) == round(sum(r["amount_sgd"] for r in open_receivables), 2)
    assert round(summary["payables_open"], 2) == round(sum(b["amount_sgd"] for b in open_payables), 2)

    # ENQUIRIES are the only fact_customer_enquiry rows dated inside FULL_RANGE
    # (every other fixture batch is TODAY-relative, outside 2025 entirely).
    assert summary["enquiry_count"] == len(ENQUIRIES)
    resolved = [e for e in ENQUIRIES if e["status"] == "resolved"]
    assert round(float(summary["avg_csat"]), 4) == round(sum(e["csat_score"] for e in resolved) / len(resolved), 4)

    all_enquiries = get_customer_enquiries(TENANT_ID, limit=500)
    expected_open = sum(1 for e in all_enquiries if e["status"] in ("open", "escalated"))
    assert summary["open_enquiries"] == expected_open

    # OPS-CRITICAL is the only open+critical fact_operational_update row.
    assert summary["open_critical_ops_updates"] == 1


# --- get_attention_items ---------------------------------------------------


def test_attention_items_every_branch_fires():
    items = get_attention_items(TENANT_ID)
    by_issue = {i["issue"]: i for i in items}

    # critical_ops_update_open is real, handled code but structurally
    # unreachable against the demo generator (it never plants "critical"
    # severity, see MCP_TOOLS.md) -- OPS-CRITICAL below is what makes it
    # reachable in this fixture; there's exactly one such row, so it's safe
    # to fold into the same by-issue dict as everything else.
    assert set(by_issue) == {
        "return_rate_high",
        "skus_out_of_stock",
        "delivery_delay_high",
        "receivable_overdue",
        "payable_overdue",
        "enquiry_volume_spike",
        "slow_first_response",
        "escalations_open",
        "critical_ops_update_open",
    }

    # return_rate_high: refunds($200) / revenue in the last real 30 days.
    # This tool's own "revenue" is gross (SUM(line_total_sgd) unconditionally,
    # matching _METRICS/get_sales_timeseries) — $1000 sale + $200 refund line
    # both count, so rate = 200/1200, not 200/1000.
    rr = by_issue["return_rate_high"]
    assert rr["domain"] == "sales"
    assert round(rr["value"], 4) == round(200 / 1200, 4)
    assert round(rr["dollar_impact_est"], 2) == 200.0

    stock = by_issue["skus_out_of_stock"]
    assert stock["domain"] == "inventory"
    assert stock["value"] == 1
    assert stock["dollar_impact_est"] is None

    delay = by_issue["delivery_delay_high"]
    assert delay["domain"] == "suppliers"
    assert delay["supplier_id"] == "SUP-SLOW"
    assert round(delay["value"], 1) == 10.0

    # The overdue check sums EVERY open invoice/bill more than 60 real days
    # past due, not just the one row dedicated to this scenario — every
    # 2025-dated open row in this fixture (including the cash-flow-forecast
    # ones) is also, incidentally, "overdue" against the real 2026+ clock.
    # Compute the expected totals the same way, from the fixture itself.
    expected_receivable_overdue = round(
        sum(i["amount_sgd"] for i in INVOICES if i["status"] != "paid" and (TODAY - i["due_date"]).days > 60), 2
    )
    expected_payable_overdue = round(
        sum(b["amount_sgd"] for b in BILLS if b["status"] != "paid" and (TODAY - b["due_date"]).days > 60), 2
    )

    receivable = by_issue["receivable_overdue"]
    assert receivable["domain"] == "accounts"
    assert round(receivable["dollar_impact_est"], 2) == expected_receivable_overdue

    payable = by_issue["payable_overdue"]
    assert payable["domain"] == "accounts"
    assert round(payable["dollar_impact_est"], 2) == expected_payable_overdue

    # enquiry_volume_spike / slow_first_response: ATTENTION_ENQUIRY_SURGE_RECENT
    # (6 rows, trailing 7 real days) vs. ATTENTION_ENQUIRY_SURGE_PRIOR (2 rows,
    # days 31/33 ago) are the only fact_customer_enquiry rows inside those two
    # windows respectively -- see fixtures.py's comment for why they don't overlap.
    recent_daily_rate = len(ATTENTION_ENQUIRY_SURGE_RECENT) / 7
    prior_daily_rate = len(ATTENTION_ENQUIRY_SURGE_PRIOR) / 28
    spike = by_issue["enquiry_volume_spike"]
    assert spike["domain"] == "customer"
    assert round(spike["value"], 2) == round(recent_daily_rate, 2)
    assert round(spike["threshold"], 2) == round(prior_daily_rate * 1.5, 2)

    # All 6 surge rows respond in exactly 30h and are the only enquiries inside
    # the trailing 30 real days -> avg is exactly 30.0.
    slow = by_issue["slow_first_response"]
    assert slow["domain"] == "customer"
    assert slow["value"] == 30.0

    escalations = by_issue["escalations_open"]
    assert escalations["domain"] == "customer"
    # ENQUIRIES has one escalated row (ENQ-4) + ATTENTION_ENQUIRY_ESCALATED has one more.
    assert escalations["value"] == 2

    critical = by_issue["critical_ops_update_open"]
    assert critical["domain"] == "operations"
    assert critical["supplier_id"] is None  # OPS-CRITICAL has no supplier_id

    # Sorted: known dollar_impact_est descending, then the null-impact items.
    known = [i for i in items if i["dollar_impact_est"] is not None]
    assert [i["dollar_impact_est"] for i in known] == sorted(
        (i["dollar_impact_est"] for i in known), reverse=True
    )
    assert all(i["dollar_impact_est"] is None for i in items[len(known):])


# --- get_benchmark_gap_analysis ---------------------------------------------------


def test_benchmark_gap_analysis_bad_date_raises():
    with pytest.raises(ValueError, match="start_date"):
        get_benchmark_gap_analysis(TENANT_ID, start_date="bogus")


def test_benchmark_gap_analysis_status_branches():
    rows = get_benchmark_gap_analysis(TENANT_ID, start_date=FULL_RANGE[0], end_date=FULL_RANGE[1])
    by_metric = {(r["domain"], r["metric"]): r for r in rows}

    payable = by_metric[("accounts", "payable_avg_days_to_settle")]
    assert payable["actual_value"] == 40.0
    assert payable["status"] == "above_benchmark"
    assert payable["gap"] == 10.0  # 40 - benchmark_high(30)

    receivable = by_metric[("accounts", "receivable_avg_days_to_settle")]
    assert receivable["actual_value"] == 20.0  # (19 + 21) / 2
    assert receivable["status"] == "within_benchmark"
    assert receivable["gap"] == 0.0

    for metric in ("refund_rate", "margin_pct"):
        row = by_metric[("sales", metric)]
        assert row["actual_value"] is not None
        assert row["status"] in {"below_benchmark", "within_benchmark", "above_benchmark"}


# --- get_trending_products ---------------------------------------------------


def test_trending_products_bad_metric_raises():
    with pytest.raises(ValueError, match="unknown metric"):
        get_trending_products(TENANT_ID, metric="bogus", as_of_date=REF_DATE.isoformat())


def test_trending_products_bad_window_raises():
    with pytest.raises(ValueError, match="window_days"):
        get_trending_products(TENANT_ID, window_days=0, as_of_date=REF_DATE.isoformat())
    with pytest.raises(ValueError, match="window_days"):
        get_trending_products(TENANT_ID, window_days=181, as_of_date=REF_DATE.isoformat())


def test_trending_products_only_genuinely_rising_skus():
    rows = get_trending_products(
        TENANT_ID, metric="units", window_days=WINDOW_DAYS, as_of_date=REF_DATE.isoformat(), limit=100
    )
    by_sku = {r["sku"]: r for r in rows}

    # SKU-TABLE-1: 20 -> 40 units, +100%, previous > 0 -> included.
    assert by_sku["SKU-TABLE-1"]["previous_value"] == 20
    assert by_sku["SKU-TABLE-1"]["current_value"] == 40
    assert by_sku["SKU-TABLE-1"]["pct_change"] == 100.0

    # SKU-CHAIR-1 (+10%) is technically rising but genuinely trending SKUs
    # should still appear if current > previous; SKU-TABLE-2 (declining) and
    # SKU-LAMP-1 (previous == 0, no baseline) must NOT appear at all.
    assert "SKU-TABLE-2" not in by_sku
    assert "SKU-LAMP-1" not in by_sku

    # Sorted pct_change descending.
    pct_changes = [r["pct_change"] for r in rows]
    assert pct_changes == sorted(pct_changes, reverse=True)


# --- get_sku_lifecycle ---------------------------------------------------


def test_sku_lifecycle_bad_window_raises():
    with pytest.raises(ValueError, match="window_days"):
        get_sku_lifecycle(TENANT_ID, window_days=0, as_of_date=REF_DATE.isoformat())


def test_sku_lifecycle_stage_classification_matches_fixture():
    rows = get_sku_lifecycle(
        TENANT_ID, metric="units", window_days=WINDOW_DAYS, as_of_date=REF_DATE.isoformat(), limit=100
    )
    by_sku = {r["sku"]: r for r in rows}

    assert by_sku["SKU-RUG-1"]["stage"] == "dead"  # previous 8 -> current 0
    assert by_sku["SKU-TABLE-2"]["stage"] == "declining"  # 40 -> 10, -75%
    assert by_sku["SKU-LAMP-1"]["stage"] == "new"  # first sale inside current window
    assert by_sku["SKU-TABLE-1"]["stage"] == "growing"  # 20 -> 40, +100%
    assert by_sku["SKU-CHAIR-1"]["stage"] == "stable"  # 10 -> 11, +10%

    # Sorted dead, declining, new, growing, then stable last.
    stage_priority = {"dead": 0, "declining": 1, "new": 2, "growing": 3, "stable": 4}
    stages = [r["stage"] for r in rows]
    assert stages == sorted(stages, key=lambda s: stage_priority[s])


# --- simulate_reorder_impact ---------------------------------------------------


def test_simulate_reorder_impact_unknown_sku_raises():
    with pytest.raises(ValueError, match="unknown sku"):
        simulate_reorder_impact(TENANT_ID, sku="SKU-DOES-NOT-EXIST", proposed_qty=10)


def test_simulate_reorder_impact_bad_qty_raises():
    with pytest.raises(ValueError, match="proposed_qty"):
        simulate_reorder_impact(TENANT_ID, sku="SKU-CHAIR-1", proposed_qty=0)


def test_simulate_reorder_impact_high_risk():
    # SKU-CHAIR-2: 0 on hand, ~0.1667 units/day demand, 20-day supplier lead
    # time -> runs out well before the order arrives.
    result = simulate_reorder_impact(TENANT_ID, sku="SKU-CHAIR-2", proposed_qty=50, order_date=REF_DATE.isoformat())
    assert result["current_on_hand"] == 0
    assert result["avg_daily_demand"] == round(10 / 60, 2)  # the tool rounds to 2dp itself
    assert result["avg_supplier_lead_time_days"] == 20.0
    assert result["stockout_risk"] == "high"
    assert result["projected_on_hand_at_arrival"] < 0


def test_simulate_reorder_impact_moderate_risk():
    # SKU-TABLE-1: 10 on hand, 1.0 unit/day demand, 7-day lead time -> arrives
    # fine (3 left) but a small reorder still leaves under 14 days of supply.
    result = simulate_reorder_impact(TENANT_ID, sku="SKU-TABLE-1", proposed_qty=2, order_date=REF_DATE.isoformat())
    assert result["current_on_hand"] == 10
    assert round(result["avg_daily_demand"], 4) == 1.0
    assert result["avg_supplier_lead_time_days"] == 7.0
    assert result["projected_on_hand_at_arrival"] == 3.0
    assert result["days_of_supply_after_receipt"] == 5.0
    assert result["stockout_risk"] == "moderate"


def test_simulate_reorder_impact_low_risk():
    # SKU-TABLE-2: 100 on hand, modest demand, short lead time -> comfortable.
    result = simulate_reorder_impact(TENANT_ID, sku="SKU-TABLE-2", proposed_qty=10, order_date=REF_DATE.isoformat())
    assert result["current_on_hand"] == 100
    assert result["avg_supplier_lead_time_days"] == 5.0
    assert result["stockout_risk"] == "low"
    assert result["days_of_supply_after_receipt"] >= 14


def test_simulate_reorder_impact_insufficient_data():
    # SKU-VASE-1 has zero order-line history at all -> zero demand.
    result = simulate_reorder_impact(TENANT_ID, sku="SKU-VASE-1", proposed_qty=10, order_date=REF_DATE.isoformat())
    assert result["avg_daily_demand"] == 0
    assert result["stockout_risk"] == "insufficient_data"
    assert result["expected_arrival_date"] is None
    assert result["days_of_supply_after_receipt"] is None


# --- get_data_freshness ---------------------------------------------------


def test_data_freshness_shape_and_sort_order():
    rows = get_data_freshness(TENANT_ID)
    tables = {r["table"] for r in rows}
    assert tables == {
        "fact_order_line",
        "fact_stock_movement",
        "fact_purchase_order",
        "fact_invoice",
        "fact_bill",
        "fact_customer_enquiry",
        "fact_operational_update",
    }
    for r in rows:
        assert r["row_count"] > 0
        # Real-clock-relative — assert shape, not an exact value.
        assert r["days_since"] is None or r["days_since"] >= 0

    # Sorted stalest (largest days_since) first, nulls last.
    known = [r["days_since"] for r in rows if r["days_since"] is not None]
    assert known == sorted(known, reverse=True)

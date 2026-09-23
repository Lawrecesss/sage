"""get_inventory_status, get_supplier_performance, get_expected_deliveries,
get_stockout_root_causes.
"""

from __future__ import annotations

import pytest
from fixtures import CURRENT_ON_HAND, SKU_BY_ID, STOCK_MOVEMENTS, TENANT_ID

from retail_mcp.server import (
    get_expected_deliveries,
    get_inventory_status,
    get_stockout_root_causes,
    get_supplier_performance,
)

# --- get_inventory_status ---------------------------------------------------


def test_inventory_status_bad_group_by_raises():
    with pytest.raises(ValueError, match="unknown group_by"):
        get_inventory_status(TENANT_ID, group_by="bogus")


def test_inventory_status_total_is_sum_of_latest_on_hand():
    rows = get_inventory_status(TENANT_ID)
    assert rows[0]["on_hand"] == sum(CURRENT_ON_HAND.values())


def test_inventory_status_by_sku_uses_latest_movement_not_a_sum():
    # fact_stock_movement is an event log; "current" on-hand for each SKU is
    # its most recent row, not SUM(qty) across every movement.
    rows = get_inventory_status(TENANT_ID, group_by="sku", limit=100)
    by_sku = {r["sku"]: r["on_hand"] for r in rows}
    for sku, expected in CURRENT_ON_HAND.items():
        if expected == 0 and sku not in by_sku:
            continue  # SKU-VASE-1 has no movement rows at all -> absent, not a 0 row
        assert by_sku[sku] == expected

    # Sorted lowest stock first — SKU-CHAIR-2 (0) must be first.
    assert rows[0]["sku"] == "SKU-CHAIR-2"
    assert rows[0]["on_hand"] == 0


def test_inventory_status_limit_clamps_result_size():
    rows = get_inventory_status(TENANT_ID, group_by="sku", limit=1)
    assert len(rows) == 1
    assert rows[0]["sku"] == "SKU-CHAIR-2"  # still the lowest-stock row


def test_inventory_status_by_category_sums_its_skus():
    rows = get_inventory_status(TENANT_ID, group_by="category")
    by_category = {r["category"]: r["on_hand"] for r in rows}
    chairs = CURRENT_ON_HAND["SKU-CHAIR-1"] + CURRENT_ON_HAND["SKU-CHAIR-2"]
    tables = CURRENT_ON_HAND["SKU-TABLE-1"] + CURRENT_ON_HAND["SKU-TABLE-2"]
    assert by_category["Chairs"] == chairs
    assert by_category["Tables"] == tables


# --- get_supplier_performance ---------------------------------------------------


def test_supplier_performance_all_suppliers():
    rows = get_supplier_performance(TENANT_ID)
    by_supplier = {r["supplier_id"]: r for r in rows}

    fast = by_supplier["SUP-FAST"]
    assert fast["po_count"] == 1
    assert float(fast["avg_lead_time_days"]) == 7.0
    assert float(fast["avg_delay_days"]) == 0.0

    slow = by_supplier["SUP-SLOW"]
    assert slow["po_count"] == 1
    assert float(slow["avg_lead_time_days"]) == 20.0
    assert float(slow["avg_delay_days"]) == 10.0

    med = by_supplier["SUP-MED"]
    assert float(med["avg_lead_time_days"]) == 5.0
    assert float(med["avg_delay_days"]) == 0.0

    # Sorted by supplier_id ascending.
    assert [r["supplier_id"] for r in rows] == sorted(by_supplier)


def test_supplier_performance_filtered_to_one_supplier():
    rows = get_supplier_performance(TENANT_ID, supplier_id="SUP-SLOW")
    assert len(rows) == 1
    assert rows[0]["supplier_id"] == "SUP-SLOW"


# --- get_expected_deliveries ---------------------------------------------------


def test_expected_deliveries_bad_date_raises():
    with pytest.raises(ValueError, match="start_date"):
        get_expected_deliveries(TENANT_ID, start_date="bogus")


def test_expected_deliveries_status_and_order():
    rows = get_expected_deliveries(TENANT_ID, start_date="2025-05-01", end_date="2025-06-30")
    po_ids = [r["po_id"] for r in rows]
    assert po_ids == ["PO-SLOW-1", "PO-FAST-1", "PO-MED-1"]  # sorted by expected_date

    by_po = {r["po_id"]: r for r in rows}
    assert by_po["PO-SLOW-1"]["status"] == "received_late"
    assert by_po["PO-FAST-1"]["status"] == "received_on_time"
    assert by_po["PO-MED-1"]["status"] == "received_on_time"
    # This fixture always sets a received_date, matching the tool's documented
    # caveat that "not_yet_received" never actually appears against seeded data.
    assert all(r["status"] != "not_yet_received" for r in rows)


def test_expected_deliveries_limit_clamps_result_size():
    rows = get_expected_deliveries(TENANT_ID, start_date="2025-05-01", end_date="2025-06-30", limit=1)
    assert len(rows) == 1
    assert rows[0]["po_id"] == "PO-SLOW-1"  # soonest expected_date


# --- get_stockout_root_causes ---------------------------------------------------


def test_stockout_root_causes_only_zero_stock_skus():
    rows = get_stockout_root_causes(TENANT_ID)
    # Only SKUs with an actual fact_stock_movement row are candidates at all —
    # SKU-VASE-1 has none, so it can't be "out of stock" despite CURRENT_ON_HAND
    # defaulting it to 0 for simulate_reorder_impact's purposes.
    tracked_skus = {m["sku"] for m in STOCK_MOVEMENTS}
    zero_stock_skus = {sku for sku in tracked_skus if CURRENT_ON_HAND[sku] <= 0}
    assert {r["sku"] for r in rows} == zero_stock_skus
    assert zero_stock_skus == {"SKU-CHAIR-2"}

    chair2 = next(r for r in rows if r["sku"] == "SKU-CHAIR-2")
    assert chair2["category"] == SKU_BY_ID["SKU-CHAIR-2"]["category"]
    assert chair2["supplier_id"] == "SUP-SLOW"
    assert float(chair2["supplier_avg_delay_days"]) == 10.0

"""get_enquiry_summary, get_customer_enquiries, get_operational_updates.

ENQUIRIES (see fixtures.py) is the only fact_customer_enquiry batch dated
inside FULL_RANGE — every other enquiry fixture batch is TODAY-relative (used
by get_attention_items in test_derived.py instead) — so summary/grouping
tests scope to FULL_RANGE to isolate exactly those 7 rows.
"""

from __future__ import annotations

import pytest
from fixtures import (
    ALL_ENQUIRIES,
    ENQUIRIES,
    OPERATIONAL_UPDATES,
    SKU_BY_ID,
    TENANT_ID,
    week_start,
)

from retail_mcp.server import (
    get_customer_enquiries,
    get_enquiry_summary,
    get_operational_updates,
)

FULL_RANGE = ("2025-01-01", "2025-07-15")

# --- get_enquiry_summary ---------------------------------------------------


def test_enquiry_summary_bad_group_by_raises():
    with pytest.raises(ValueError, match="unknown group_by"):
        get_enquiry_summary(TENANT_ID, group_by="bogus")


def test_enquiry_summary_bad_date_raises():
    with pytest.raises(ValueError, match="start_date"):
        get_enquiry_summary(TENANT_ID, start_date="bogus")


def test_enquiry_summary_by_topic_matches_fixture():
    rows = get_enquiry_summary(TENANT_ID, group_by="topic", start_date=FULL_RANGE[0], end_date=FULL_RANGE[1])
    by_topic = {r["topic"]: r for r in rows}

    assert sum(r["enquiry_count"] for r in rows) == len(ENQUIRIES)
    assert by_topic["order_status"]["enquiry_count"] == 2  # ENQ-1, ENQ-7
    assert by_topic["return_refund"]["enquiry_count"] == 1  # ENQ-2

    order_status_csats = [e["csat_score"] for e in ENQUIRIES if e["topic"] == "order_status"]
    assert round(float(by_topic["order_status"]["avg_csat"]), 4) == round(
        sum(order_status_csats) / len(order_status_csats), 4
    )

    billing = by_topic["billing"]
    assert billing["enquiry_count"] == 1
    assert billing["escalated_count"] == 1  # ENQ-4
    assert billing["avg_csat"] is None  # not resolved yet

    # Sorted enquiry_count descending.
    assert [r["enquiry_count"] for r in rows] == sorted((r["enquiry_count"] for r in rows), reverse=True)


def test_enquiry_summary_by_segment_and_channel():
    by_segment = {
        r["segment"]: r["enquiry_count"]
        for r in get_enquiry_summary(TENANT_ID, group_by="segment", start_date=FULL_RANGE[0], end_date=FULL_RANGE[1])
    }
    assert by_segment == {"retail": 4, "wholesale": 3}

    by_channel = {
        r["contact_channel"]: r["enquiry_count"]
        for r in get_enquiry_summary(
            TENANT_ID, group_by="contact_channel", start_date=FULL_RANGE[0], end_date=FULL_RANGE[1]
        )
    }
    assert by_channel == {"email": 3, "phone": 1, "live_chat": 1, "in_store": 1, "marketplace_chat": 1}


def test_enquiry_summary_by_category_joins_dim_sku_and_drops_null_sku():
    rows = get_enquiry_summary(TENANT_ID, group_by="category", start_date=FULL_RANGE[0], end_date=FULL_RANGE[1])
    by_category = {r["category"]: r["enquiry_count"] for r in rows}
    # ENQ-4 (billing) has no sku -> excluded from a category breakdown entirely,
    # not grouped under a null category.
    assert sum(by_category.values()) == len(ENQUIRIES) - 1
    assert by_category[SKU_BY_ID["SKU-CHAIR-1"]["category"]] == 4  # ENQ-1, 2, 3, 6 (Chairs)
    assert by_category[SKU_BY_ID["SKU-TABLE-1"]["category"]] == 2  # ENQ-5, 7 (Tables)


def test_enquiry_summary_by_week_is_chronological():
    rows = get_enquiry_summary(TENANT_ID, group_by="week", start_date=FULL_RANGE[0], end_date=FULL_RANGE[1])
    assert sum(r["enquiry_count"] for r in rows) == len(ENQUIRIES)
    assert [r["week"] for r in rows] == sorted(r["week"] for r in rows)
    # Every enquiry's own Monday-starting week appears among the buckets.
    assert {week_start(e["date"]) for e in ENQUIRIES} == {r["week"] for r in rows}


# --- get_customer_enquiries -------------------------------------------------


def test_customer_enquiries_bad_topic_raises():
    with pytest.raises(ValueError, match="unknown topic"):
        get_customer_enquiries(TENANT_ID, topic="bogus")


def test_customer_enquiries_bad_status_raises():
    with pytest.raises(ValueError, match="unknown status"):
        get_customer_enquiries(TENANT_ID, status="bogus")


def test_customer_enquiries_filter_by_topic_and_date_range():
    rows = get_customer_enquiries(
        TENANT_ID, topic="return_refund", start_date=FULL_RANGE[0], end_date=FULL_RANGE[1], limit=500
    )
    assert len(rows) == 1
    assert rows[0]["enquiry_id"] == "ENQ-2"


def test_customer_enquiries_filter_by_sku_spans_every_fixture_batch():
    rows = get_customer_enquiries(TENANT_ID, sku="SKU-CHAIR-1", limit=500)
    expected = [e for e in ALL_ENQUIRIES if e["sku"] == "SKU-CHAIR-1"]
    assert len(rows) == len(expected)
    assert all(r["sku"] == "SKU-CHAIR-1" for r in rows)


def test_customer_enquiries_escalated_status_sorted_by_date():
    rows = get_customer_enquiries(TENANT_ID, status="escalated", limit=500)
    ids = [r["enquiry_id"] for r in rows]
    assert set(ids) == {"ENQ-4", "ENQ-ESCALATED-1"}
    # Both escalated + priority=high -> tiebreak on date ascending; ENQ-4 (2025)
    # is chronologically before ENQ-ESCALATED-1 (TODAY - 40 days).
    assert ids == ["ENQ-4", "ENQ-ESCALATED-1"]
    assert all(r["status"] == "escalated" for r in rows)


def test_customer_enquiries_limit_clamps_result_size():
    assert len(get_customer_enquiries(TENANT_ID, limit=1)) == 1
    assert len(get_customer_enquiries(TENANT_ID, limit=99999)) <= 500


# --- get_operational_updates ------------------------------------------------


def test_operational_updates_bad_area_raises():
    with pytest.raises(ValueError, match="unknown area"):
        get_operational_updates(TENANT_ID, area="bogus")


def test_operational_updates_bad_severity_raises():
    with pytest.raises(ValueError, match="unknown severity"):
        get_operational_updates(TENANT_ID, severity="bogus")


def test_operational_updates_bad_status_raises():
    with pytest.raises(ValueError, match="unknown status"):
        get_operational_updates(TENANT_ID, status="bogus")


def test_operational_updates_filter_by_area():
    rows = get_operational_updates(TENANT_ID, area="logistics", limit=500)
    assert [r["update_id"] for r in rows] == ["OPS-1"]
    assert rows[0]["supplier_id"] == "SUP-SLOW"


def test_operational_updates_filter_by_severity_and_status():
    rows = get_operational_updates(TENANT_ID, severity="critical", limit=500)
    assert [r["update_id"] for r in rows] == ["OPS-CRITICAL"]

    open_rows = get_operational_updates(TENANT_ID, status="open", limit=500)
    assert [r["update_id"] for r in open_rows] == ["OPS-CRITICAL"]


def test_operational_updates_sorted_newest_first():
    rows = get_operational_updates(TENANT_ID, limit=500)
    assert len(rows) == len(OPERATIONAL_UPDATES)
    dates = [r["date"] for r in rows]
    assert dates == sorted(dates, reverse=True)
    assert rows[0]["update_id"] == "OPS-CRITICAL"  # the only TODAY-relative row


def test_operational_updates_limit_clamps_result_size():
    assert len(get_operational_updates(TENANT_ID, limit=1)) == 1

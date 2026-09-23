"""get_sales_timeseries, compare_periods, get_seasonal_pattern, get_channel_performance.

All four share server.py's _METRICS/_GROUP_BY allowlists, so the input-
validation shape is identical across them — each gets its own bad-input
test, but the fixture/expected-value plumbing (fixtures.metric_total /
in_range) is shared.
"""

from __future__ import annotations

from datetime import date

import pytest
from fixtures import (
    ALL_ORDER_LINES,
    ORDER_LINES,
    SKU_BY_ID,
    TENANT_ID,
    in_range,
    metric_total,
)

from retail_mcp.server import (
    compare_periods,
    get_channel_performance,
    get_sales_timeseries,
    get_seasonal_pattern,
)

FULL_RANGE = (date(2025, 1, 1), date(2025, 7, 15))


# --- get_sales_timeseries ---------------------------------------------------


def test_sales_timeseries_bad_metric_raises():
    with pytest.raises(ValueError, match="unknown metric"):
        get_sales_timeseries(TENANT_ID, metric="bogus")


def test_sales_timeseries_bad_group_by_raises():
    with pytest.raises(ValueError, match="unknown group_by"):
        get_sales_timeseries(TENANT_ID, metric="revenue", group_by="bogus")


def test_sales_timeseries_bad_date_raises():
    with pytest.raises(ValueError, match="start_date"):
        get_sales_timeseries(TENANT_ID, metric="revenue", start_date="15-06-2025")


@pytest.mark.parametrize("metric", ["revenue", "units", "refunds", "margin"])
def test_sales_timeseries_total_matches_fixture(metric):
    start, end = FULL_RANGE
    rows = get_sales_timeseries(TENANT_ID, metric=metric, start_date=start.isoformat(), end_date=end.isoformat())
    expected = metric_total(in_range(ORDER_LINES, start, end), metric)
    assert round(sum(r[metric] for r in rows), 2) == expected


def test_sales_timeseries_group_by_category():
    start, end = FULL_RANGE
    rows = get_sales_timeseries(
        TENANT_ID, metric="units", group_by="category", start_date=start.isoformat(), end_date=end.isoformat()
    )
    by_category: dict[str, int] = {}
    for r in in_range(ORDER_LINES, start, end):
        cat = SKU_BY_ID[r["sku"]]["category"]
        by_category[cat] = by_category.get(cat, 0) + r["qty"]
    totals = {}
    for r in rows:
        totals[r["category"]] = totals.get(r["category"], 0) + r["units"]
    assert totals == by_category


def test_sales_timeseries_date_filter_excludes_outside_rows():
    # 2025-03-01 (the CHAIR-1 refund) sits outside this narrower window.
    rows = get_sales_timeseries(TENANT_ID, metric="units", start_date="2025-06-01", end_date="2025-06-15")
    total = sum(r["units"] for r in rows)
    expected = metric_total(in_range(ORDER_LINES, date(2025, 6, 1), date(2025, 6, 15)), "units")
    assert total == expected
    assert total != metric_total(ORDER_LINES, "units")  # sanity: the filter actually did something


# --- compare_periods ---------------------------------------------------


def test_compare_periods_bad_metric_raises():
    with pytest.raises(ValueError, match="unknown metric"):
        compare_periods(TENANT_ID, "bogus", "2025-06-02", "2025-06-15", "2025-05-19", "2025-06-01")


def test_compare_periods_bad_date_raises():
    with pytest.raises(ValueError, match="current_start"):
        compare_periods(TENANT_ID, "units", "not-a-date", "2025-06-15", "2025-05-19", "2025-06-01")


def test_compare_periods_pct_change_matches_fixture():
    # SKU-TABLE-1's own window: previous 20 units -> current 40 units, +100%.
    rows = compare_periods(
        TENANT_ID, "units", "2025-06-02", "2025-06-15", "2025-05-19", "2025-06-01", group_by="sku"
    )
    by_sku = {r["sku"]: r for r in rows}
    table1 = by_sku["SKU-TABLE-1"]
    assert table1["previous_value"] == 20
    assert table1["current_value"] == 40
    assert table1["pct_change"] == 100.0

    # Sorted biggest mover first.
    pct_changes = [r["pct_change"] for r in rows if r["pct_change"] is not None]
    assert pct_changes == sorted(pct_changes, reverse=True)


def test_compare_periods_zero_previous_value_is_null_pct_change():
    # SKU-LAMP-1 has zero units in the previous window (its first sale is in
    # the current window) -> pct_change must be null, not a divide-by-zero
    # crash or a fabricated 0%.
    rows = compare_periods(
        TENANT_ID, "units", "2025-06-02", "2025-06-15", "2025-05-19", "2025-06-01", group_by="sku"
    )
    lamp = next(r for r in rows if r.get("sku") == "SKU-LAMP-1")
    assert lamp["previous_value"] == 0
    assert lamp["current_value"] == 3
    assert lamp["pct_change"] is None


# --- get_seasonal_pattern ---------------------------------------------------


def test_seasonal_pattern_bad_metric_raises():
    with pytest.raises(ValueError, match="unknown metric"):
        get_seasonal_pattern(TENANT_ID, metric="bogus")


def test_seasonal_pattern_bad_breakdown_raises():
    with pytest.raises(ValueError, match="unknown breakdown"):
        get_seasonal_pattern(TENANT_ID, breakdown="bogus")


def test_seasonal_pattern_holiday_bucket_matches_fixture():
    # No date filter — this tool scans the whole history, so the expected
    # value must include every ALL_ORDER_LINES row (the TODAY-anchored ones
    # too), not just the 2025-dated ones.
    rows = get_seasonal_pattern(TENANT_ID, metric="units", breakdown="holiday")
    by_holiday = {r["bucket"]: r["value"] for r in rows}
    holiday_units = sum(r["qty"] for r in ALL_ORDER_LINES if r["date"] == date(2025, 6, 1))
    non_holiday_units = sum(r["qty"] for r in ALL_ORDER_LINES) - holiday_units
    assert by_holiday[True] == holiday_units
    assert by_holiday[False] == non_holiday_units


def test_seasonal_pattern_day_of_week_sorted_calendar_order():
    rows = get_seasonal_pattern(TENANT_ID, metric="units", breakdown="day_of_week")
    buckets = [r["bucket"] for r in rows]
    calendar_order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    assert buckets == [d for d in calendar_order if d in buckets]


# --- get_channel_performance ---------------------------------------------------


def test_channel_performance_bad_date_raises():
    with pytest.raises(ValueError, match="start_date"):
        get_channel_performance(TENANT_ID, start_date="bogus")


def test_channel_performance_matches_fixture_and_avg_math():
    start, end = FULL_RANGE
    rows = get_channel_performance(TENANT_ID, start_date=start.isoformat(), end_date=end.isoformat())
    by_channel = {r["channel"]: r for r in rows}

    online_lines = [r for r in in_range(ORDER_LINES, start, end) if r["channel"] == "online"]
    online = by_channel["online"]
    assert online["order_count"] == len(online_lines)  # one line per order in this schema
    assert round(online["revenue"], 2) == round(sum(r["line_total_sgd"] for r in online_lines), 2)
    assert online["units"] == sum(r["qty"] for r in online_lines)
    assert round(float(online["avg_order_value"]), 2) == round(online["revenue"] / online["order_count"], 2)
    assert round(float(online["avg_units_per_order"]), 2) == round(online["units"] / online["order_count"], 2)

    # Sorted revenue descending.
    revenues = [r["revenue"] for r in rows]
    assert revenues == sorted(revenues, reverse=True)

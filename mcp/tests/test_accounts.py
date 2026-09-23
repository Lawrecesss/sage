"""get_accounts_status and get_cash_flow_forecast."""

from __future__ import annotations

from datetime import timedelta

import pytest
from fixtures import BILLS, INVOICES, REF_DATE, TENANT_ID

from retail_mcp.server import get_accounts_status, get_cash_flow_forecast

# --- get_accounts_status ---------------------------------------------------


def test_accounts_status_bad_kind_raises():
    with pytest.raises(ValueError, match="unknown kind"):
        get_accounts_status(TENANT_ID, kind="bogus")


def test_accounts_status_bad_status_raises():
    with pytest.raises(ValueError, match="unknown status"):
        get_accounts_status(TENANT_ID, kind="receivable", status="bogus")


def test_accounts_status_receivable_open_matches_fixture():
    rows = get_accounts_status(TENANT_ID, kind="receivable", status="open", limit=100)
    expected_open = [i for i in INVOICES if i["status"] == "open"]
    assert len(rows) == len(expected_open)
    assert {round(r["amount_sgd"], 2) for r in rows} == {round(i["amount_sgd"], 2) for i in expected_open}
    # Sorted soonest due_date first.
    due_dates = [r["due_date"] for r in rows]
    assert due_dates == sorted(due_dates)


def test_accounts_status_payable_paid_matches_fixture():
    rows = get_accounts_status(TENANT_ID, kind="payable", status="paid", limit=100)
    expected_paid = [b for b in BILLS if b["status"] == "paid"]
    assert len(rows) == len(expected_paid)
    for r in rows:
        assert r["status"] == "paid"
        assert r["paid_date"] is not None


def test_accounts_status_limit_clamps_result_size():
    rows = get_accounts_status(TENANT_ID, kind="receivable", limit=1)
    assert len(rows) == 1


# --- get_cash_flow_forecast ---------------------------------------------------


def test_cash_flow_forecast_bad_horizon_raises():
    with pytest.raises(ValueError, match="horizon_days"):
        get_cash_flow_forecast(TENANT_ID, horizon_days=0)
    with pytest.raises(ValueError, match="horizon_days"):
        get_cash_flow_forecast(TENANT_ID, horizon_days=91)


def test_cash_flow_forecast_bad_date_raises():
    with pytest.raises(ValueError, match="as_of_date"):
        get_cash_flow_forecast(TENANT_ID, as_of_date="bogus")


def test_cash_flow_forecast_window_sums_and_identity():
    result = get_cash_flow_forecast(TENANT_ID, horizon_days=30, as_of_date=REF_DATE.isoformat())

    # Compute the window bound the same way the tool does: as_of .. as_of+horizon.
    window_end = REF_DATE + timedelta(days=30)
    expected_receivables = round(
        sum(i["amount_sgd"] for i in INVOICES if i["status"] != "paid" and REF_DATE <= i["due_date"] <= window_end),
        2,
    )
    expected_payables = round(
        sum(b["amount_sgd"] for b in BILLS if b["status"] != "paid" and REF_DATE <= b["due_date"] <= window_end),
        2,
    )

    assert round(result["receivables_due_in_window"], 2) == expected_receivables
    assert round(result["payables_due_in_window"], 2) == expected_payables
    # The far-out invoice (due 2025-08-01) must be excluded from a 30-day horizon.
    assert expected_receivables != round(sum(i["amount_sgd"] for i in INVOICES if i["status"] != "paid"), 2)

    # Pure arithmetic identity on the tool's own three numbers — safe regardless
    # of the weekday-average revenue projection's own value.
    assert round(
        result["net_projected_cash_flow"], 2
    ) == round(
        result["receivables_due_in_window"] + result["projected_new_sales_revenue"] - result["payables_due_in_window"],
        2,
    )
    # `date + interval` arithmetic in the tool's SQL returns horizon_end_date as
    # a datetime (as_of_date stays a plain date) — compare just the date part.
    assert result["as_of_date"].isoformat() == REF_DATE.isoformat()
    assert str(result["horizon_end_date"])[:10] == window_end.isoformat()

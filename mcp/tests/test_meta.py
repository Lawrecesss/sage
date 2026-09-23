"""ping, describe_schema, and tenant-validation enforcement."""

from __future__ import annotations

from datetime import datetime

import pytest
from fixtures import TENANT_ID

from retail_mcp.db import UnknownTenantError
from retail_mcp.server import describe_schema, get_sales_timeseries, ping

EXPECTED_TABLES = {
    "dim_date",
    "dim_supplier",
    "dim_sku",
    "dim_channel",
    "dim_customer_segment",
    "fact_order_line",
    "fact_stock_movement",
    "fact_purchase_order",
    "fact_invoice",
    "fact_bill",
}


def test_ping():
    result = ping()
    assert result["ok"] is True
    assert result["server"] == "retail-mcp"
    # Raises if not a valid ISO timestamp.
    datetime.fromisoformat(result["time"])


def test_describe_schema_lists_every_tenant_table():
    result = describe_schema(TENANT_ID)
    assert set(result) == EXPECTED_TABLES
    order_line_columns = {c["name"] for c in result["fact_order_line"]}
    assert {"order_id", "sku", "qty", "line_total_sgd", "is_refund"} <= order_line_columns


@pytest.mark.parametrize("bad_tenant", ["unknown_tenant", "demo-with-dashes", "1starts-with-digit"])
def test_unknown_or_invalid_tenant_rejected(bad_tenant):
    with pytest.raises(UnknownTenantError):
        get_sales_timeseries(bad_tenant, metric="revenue")

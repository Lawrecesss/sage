"""Fixtures for the retail_mcp integration tests.

Real Postgres, not mocks: every tool wraps hand-written SQL against a
tenant-scoped schema, so mocking the DB layer would only prove the mocks
return what they were told to. `DATABASE_URL` must be set before
`retail_mcp.db`/`retail_mcp.server` are imported anywhere in the process
(`get_engine()` is `@lru_cache`d on first call) — done at the very top of
this module, since conftest.py always loads before any test module in this
directory.
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://sage:sage@localhost:5432/sage")

import pytest
from _schema import (
    dim_channel,
    dim_customer_segment,
    dim_date,
    dim_sku,
    dim_supplier,
    fact_bill,
    fact_invoice,
    fact_order_line,
    fact_purchase_order,
    fact_stock_movement,
    provision_tenant,
    shared_metadata,
)
from fixtures import (
    ALL_ORDER_LINES,
    BILLS,
    CHANNELS,
    DATES,
    INVOICES,
    PURCHASE_ORDERS,
    SEGMENTS,
    SKUS,
    STOCK_MOVEMENTS,
    SUPPLIERS,
    TENANT_ID,
)
from sqlalchemy import create_engine, text


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    yield eng
    eng.dispose()


def _drop_tenant(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{TENANT_ID}" CASCADE'))
        # On a genuinely fresh DB (e.g. CI, vs. a dev box that already ran `make seed`
        # for some other tenant) shared.tenants/tenant_modules don't exist yet — create
        # them (idempotent) before deleting from them, or this fails on first run.
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS shared"))
        shared_metadata.create_all(conn, checkfirst=True)
        conn.execute(text("DELETE FROM shared.tenant_modules WHERE tenant_id = :t"), {"t": TENANT_ID})
        conn.execute(text("DELETE FROM shared.tenants WHERE tenant_id = :t"), {"t": TENANT_ID})


@pytest.fixture(scope="session", autouse=True)
def seeded_tenant(engine):
    """Provisions TENANT_ID fresh and seeds the fixture dataset for the whole
    session — every tool under test is read-only, so one shared dataset is
    safe across all tests and far simpler than per-test isolation.

    Drops any leftovers from a previous (e.g. crashed) run first, so a run is
    deterministic regardless of what state the DB was left in before.
    """
    _drop_tenant(engine)
    provision_tenant(engine, TENANT_ID, ["retail"])

    with engine.begin() as conn:
        conn.execute(text(f'SET search_path TO "{TENANT_ID}"'))
        conn.execute(dim_channel.insert(), CHANNELS)
        conn.execute(dim_customer_segment.insert(), SEGMENTS)
        conn.execute(dim_supplier.insert(), SUPPLIERS)
        conn.execute(dim_sku.insert(), SKUS)
        conn.execute(dim_date.insert(), DATES)
        conn.execute(fact_order_line.insert(), ALL_ORDER_LINES)
        conn.execute(fact_stock_movement.insert(), STOCK_MOVEMENTS)
        conn.execute(fact_purchase_order.insert(), PURCHASE_ORDERS)
        conn.execute(fact_invoice.insert(), INVOICES)
        conn.execute(fact_bill.insert(), BILLS)

    yield

    _drop_tenant(engine)


@pytest.fixture
def tenant_id() -> str:
    return TENANT_ID

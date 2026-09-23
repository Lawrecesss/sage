"""Per-tenant + control-plane DDL for the test fixtures — copied from
data/simulator/src/sage_simulator/db/{schema,shared_schema}.py rather than
imported from it. docker-compose.yml's own header states the architecture
this repo follows: "Each service builds from its own folder (own Dockerfile
+ own lockfile — no shared workspace)". mcp/Dockerfile's build context is
`./mcp` only, so a cross-service path dependency on ../data/simulator can
never be *installed* into the production image — but `uv sync --no-dev`
still needs to *resolve* every path source in pyproject.toml regardless of
which group it's in, and that resolution fails hard when the path isn't
reachable inside the build context. A dev-only path dependency there broke
the prod Docker build (`uv sync --no-dev --no-install-project` failed with
"Distribution not found at: file:///data/simulator") — confirmed by actually
rebuilding the image, not assumed. Keeping this test-only copy in sync with
the simulator's schema by hand is the accepted cost of test isolation here;
if the two ever drift, a real seed (`make seed`) run failing against these
tools while these tests still pass would be the tell.
"""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    func,
    text,
)

metadata = MetaData()

dim_date = Table(
    "dim_date",
    metadata,
    Column("date", Date, primary_key=True),
    Column("dow", String, nullable=False),
    Column("week", Integer, nullable=False),
    Column("month", Integer, nullable=False),
    Column("quarter", Integer, nullable=False),
    Column("year", Integer, nullable=False),
    Column("is_holiday", Boolean, nullable=False),
    Column("holiday_name", String, nullable=True),
)

dim_supplier = Table(
    "dim_supplier",
    metadata,
    Column("supplier_id", String, primary_key=True),
    Column("name", String, nullable=False),
    Column("country", String, nullable=False),
    Column("lead_time_days", Integer, nullable=False),
    Column("on_time_rate", Float, nullable=False),
    Column("payment_terms_days", Integer, nullable=False),
)

dim_sku = Table(
    "dim_sku",
    metadata,
    Column("sku", String, primary_key=True),
    Column("name", String, nullable=False),
    Column("category", String, nullable=False),
    Column("subcategory", String, nullable=False),
    Column("supplier_id", String, ForeignKey("dim_supplier.supplier_id"), nullable=False),
    Column("unit_cost_sgd", Float, nullable=False),
    Column("list_price_sgd", Float, nullable=False),
    Column("abc_class", String, nullable=False),
)

dim_channel = Table(
    "dim_channel",
    metadata,
    Column("channel", String, primary_key=True),
    Column("revenue_share", Float, nullable=False),
    Column("avg_order_value_sgd", Float, nullable=False),
)

dim_customer_segment = Table(
    "dim_customer_segment",
    metadata,
    Column("segment", String, primary_key=True),
    Column("label", String, nullable=False),
    Column("order_share", Float, nullable=False),
    Column("pays_on_credit", Boolean, nullable=False),
)

fact_order_line = Table(
    "fact_order_line",
    metadata,
    Column("order_id", String, primary_key=True),
    Column("line_id", String, primary_key=True),
    Column("date", Date, ForeignKey("dim_date.date"), nullable=False),
    Column("sku", String, ForeignKey("dim_sku.sku"), nullable=False),
    Column("channel", String, ForeignKey("dim_channel.channel"), nullable=False),
    Column("segment", String, ForeignKey("dim_customer_segment.segment"), nullable=False),
    Column("qty", Integer, nullable=False),
    Column("unit_price_sgd", Float, nullable=False),
    Column("unit_cost_sgd", Float, nullable=False),
    Column("line_total_sgd", Float, nullable=False),
    Column("is_refund", Boolean, nullable=False),
)

fact_stock_movement = Table(
    "fact_stock_movement",
    metadata,
    Column("movement_id", String, primary_key=True),
    Column("date", Date, ForeignKey("dim_date.date"), nullable=False),
    Column("sku", String, ForeignKey("dim_sku.sku"), nullable=False),
    Column("movement_type", String, nullable=False),
    Column("qty", Integer, nullable=False),
    Column("on_hand_after", Integer, nullable=False),
)

fact_purchase_order = Table(
    "fact_purchase_order",
    metadata,
    Column("po_id", String, primary_key=True),
    Column("sku", String, ForeignKey("dim_sku.sku"), nullable=False),
    Column("supplier_id", String, ForeignKey("dim_supplier.supplier_id"), nullable=False),
    Column("ordered_date", Date, nullable=False),
    Column("expected_date", Date, nullable=False),
    Column("received_date", Date, nullable=False),
    Column("qty", Integer, nullable=False),
    Column("unit_cost_sgd", Float, nullable=False),
)

fact_invoice = Table(
    "fact_invoice",
    metadata,
    Column("invoice_id", String, primary_key=True),
    Column("order_id", String, nullable=False),
    Column("segment", String, ForeignKey("dim_customer_segment.segment"), nullable=False),
    Column("date", Date, nullable=False),
    Column("due_date", Date, nullable=False),
    Column("paid_date", Date, nullable=True),
    Column("amount_sgd", Float, nullable=False),
    Column("status", String, nullable=False),
)

fact_bill = Table(
    "fact_bill",
    metadata,
    Column("bill_id", String, primary_key=True),
    Column("po_id", String, nullable=False),
    Column("supplier_id", String, ForeignKey("dim_supplier.supplier_id"), nullable=False),
    Column("date", Date, nullable=False),
    Column("due_date", Date, nullable=False),
    Column("paid_date", Date, nullable=True),
    Column("amount_sgd", Float, nullable=False),
    Column("status", String, nullable=False),
)

shared_metadata = MetaData(schema="shared")

tenants = Table(
    "tenants",
    shared_metadata,
    Column("tenant_id", String, primary_key=True),
    Column("name", String, nullable=False),
    Column("status", String, nullable=False, server_default="active"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

tenant_modules = Table(
    "tenant_modules",
    shared_metadata,
    Column("tenant_id", String, ForeignKey("shared.tenants.tenant_id"), primary_key=True),
    Column("module_name", String, primary_key=True),
    Column("enabled", Boolean, nullable=False, server_default="true"),
    Column("config_json", String, nullable=True),
)


def provision_tenant(engine, tenant_id: str, modules: list[str]) -> None:
    """Same shape as sage_simulator.db.provision.provision_tenant — copied
    rather than imported, see this module's docstring."""
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS shared"))
        shared_metadata.create_all(conn)

        conn.execute(
            text(
                """
                INSERT INTO shared.tenants (tenant_id, name, status)
                VALUES (:tenant_id, :tenant_id, 'active')
                ON CONFLICT (tenant_id) DO NOTHING
                """
            ),
            {"tenant_id": tenant_id},
        )
        for module in modules:
            conn.execute(
                text(
                    """
                    INSERT INTO shared.tenant_modules (tenant_id, module_name, enabled)
                    VALUES (:tenant_id, :module_name, true)
                    ON CONFLICT (tenant_id, module_name) DO UPDATE SET enabled = true
                    """
                ),
                {"tenant_id": tenant_id, "module_name": module},
            )

        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{tenant_id}"'))
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))
        metadata.create_all(conn, checkfirst=True)

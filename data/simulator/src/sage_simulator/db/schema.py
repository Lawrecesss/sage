"""Postgres DDL for everything `sage_simulator` seeds.

`data/warehouse` (which used to own this) was deleted — its `schema.sql` was
only ever a comment-based stub, never real DDL. This module is the real thing,
scoped to exactly what the simulator writes: master-data dims and the
transactional facts. Agent-facing derived tables (`signals`, `briefings`,
`causal_chains`, `agent_runs`) belong to a future detector/mcp-write-path
service, not here.
"""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
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
    Column("unit_cost_sgd", Float, nullable=False),  # snapshot at time of sale
    Column("line_total_sgd", Float, nullable=False),
    Column("is_refund", Boolean, nullable=False),
)
# Every sales/accounting query filters or groups by date range (get_sales_timeseries,
# get_trending_products, the web dashboard's trailing-window comparisons, ...).
Index("ix_order_line_date", fact_order_line.c.date)

fact_stock_movement = Table(
    "fact_stock_movement",
    metadata,
    Column("movement_id", String, primary_key=True),
    Column("date", Date, ForeignKey("dim_date.date"), nullable=False),
    Column("sku", String, ForeignKey("dim_sku.sku"), nullable=False),
    Column("movement_type", String, nullable=False),  # "sale" | "receipt"
    Column("qty", Integer, nullable=False),  # negative for sale, positive for receipt
    Column("on_hand_after", Integer, nullable=False),
)
# Every "current stock" read (retail-mcp's get_inventory_status/get_business_health_summary/
# get_stockout_root_causes/simulate_reorder_impact, and web's dashboard) does
# SELECT DISTINCT ON (sku) ... ORDER BY sku, date DESC, movement_id DESC. Without this index
# Postgres has to sort the entire table from scratch for that (an "external merge" disk sort
# on this table's row count) — this index lets it satisfy the DISTINCT ON via an index scan.
Index(
    "ix_stock_movement_sku_date_movement",
    fact_stock_movement.c.sku,
    fact_stock_movement.c.date.desc(),
    fact_stock_movement.c.movement_id.desc(),
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
# get_supplier_performance/get_stockout_root_causes/get_attention_items all GROUP BY
# supplier_id; the dashboard's lead-time trend additionally filters/splits on ordered_date.
Index("ix_purchase_order_supplier", fact_purchase_order.c.supplier_id)
Index("ix_purchase_order_ordered_date", fact_purchase_order.c.ordered_date)

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
    Column("status", String, nullable=False),  # "paid" | "open" | "overdue"
)
# get_accounts_status/get_attention_items/the dashboard's ageing buckets all filter
# "status != 'paid' AND <days overdue on due_date>".
Index("ix_invoice_status_due_date", fact_invoice.c.status, fact_invoice.c.due_date)

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
Index("ix_bill_status_due_date", fact_bill.c.status, fact_bill.c.due_date)

fact_customer_enquiry = Table(
    "fact_customer_enquiry",
    metadata,
    Column("enquiry_id", String, primary_key=True),
    Column("date", Date, ForeignKey("dim_date.date"), nullable=False),
    Column("contact_channel", String, nullable=False),
    Column("segment", String, ForeignKey("dim_customer_segment.segment"), nullable=False),
    Column("topic", String, nullable=False),
    Column("order_id", String, nullable=True),  # no FK -- same as fact_invoice.order_id
    Column("sku", String, ForeignKey("dim_sku.sku"), nullable=True),
    Column("priority", String, nullable=False),
    Column("status", String, nullable=False),  # "open" | "resolved" | "escalated"
    Column("first_response_hours", Float, nullable=False),
    Column("resolved_date", Date, nullable=True),
    Column("csat_score", Integer, nullable=True),
)
# get_customer_enquiries/get_enquiry_summary filter/group by topic within a date range.
Index("ix_customer_enquiry_date", fact_customer_enquiry.c.date)
Index("ix_customer_enquiry_topic_date", fact_customer_enquiry.c.topic, fact_customer_enquiry.c.date)

fact_operational_update = Table(
    "fact_operational_update",
    metadata,
    Column("update_id", String, primary_key=True),
    Column("date", Date, ForeignKey("dim_date.date"), nullable=False),
    Column("area", String, nullable=False),
    Column("severity", String, nullable=False),  # "info" | "warning" | "critical"
    Column("title", String, nullable=False),
    Column("detail", String, nullable=False),
    Column("supplier_id", String, ForeignKey("dim_supplier.supplier_id"), nullable=True),
    Column("channel", String, ForeignKey("dim_channel.channel"), nullable=True),
    Column("category", String, nullable=True),
    Column("status", String, nullable=False),  # "open" | "resolved"
    Column("resolved_date", Date, nullable=True),
)
Index("ix_operational_update_date", fact_operational_update.c.date)

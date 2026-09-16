"""Wipes and reseeds Postgres from a generated `Dataset`."""

from __future__ import annotations

from dataclasses import asdict

from sqlalchemy import Engine, insert

from ..config import GeneratorConfig
from ..entities import Entities
from ..facts import Dataset
from . import schema

__all__ = ["seed"]


def _bulk_insert(conn, table, rows: list[dict]) -> None:
    if rows:
        conn.execute(insert(table), rows)


def seed(engine: Engine, dataset: Dataset, entities: Entities, config: GeneratorConfig) -> None:
    schema.metadata.drop_all(engine)
    schema.metadata.create_all(engine)

    with engine.begin() as conn:
        _bulk_insert(conn, schema.dim_date, [asdict(row) for row in dataset.dates])
        _bulk_insert(
            conn,
            schema.dim_supplier,
            [
                {
                    "supplier_id": s.id,
                    "name": s.name,
                    "country": s.country,
                    "lead_time_days": s.lead_time_days,
                    "on_time_rate": s.on_time_rate,
                    "payment_terms_days": s.payment_terms_days,
                }
                for s in entities.suppliers
            ],
        )
        _bulk_insert(
            conn,
            schema.dim_sku,
            [
                {
                    "sku": sku.sku,
                    "name": sku.name,
                    "category": sku.category,
                    "subcategory": sku.subcategory,
                    "supplier_id": sku.supplier_id,
                    "unit_cost_sgd": sku.unit_cost_sgd,
                    "list_price_sgd": sku.list_price_sgd,
                    "abc_class": sku.abc_class,
                }
                for sku in entities.catalog
            ],
        )
        _bulk_insert(
            conn,
            schema.dim_channel,
            [
                {
                    "channel": c.name,
                    "revenue_share": c.revenue_share,
                    "avg_order_value_sgd": c.avg_order_value_sgd,
                }
                for c in config.channels
            ],
        )
        _bulk_insert(
            conn,
            schema.dim_customer_segment,
            [
                {
                    "segment": seg.name,
                    "label": seg.label,
                    "order_share": seg.order_share,
                    "pays_on_credit": seg.pays_on_credit,
                }
                for seg in entities.segments
            ],
        )

        _bulk_insert(conn, schema.fact_order_line, [asdict(row) for row in dataset.order_lines])
        _bulk_insert(conn, schema.fact_stock_movement, [asdict(row) for row in dataset.stock_movements])
        _bulk_insert(conn, schema.fact_purchase_order, [asdict(row) for row in dataset.purchase_orders])
        _bulk_insert(conn, schema.fact_invoice, [asdict(row) for row in dataset.invoices])
        _bulk_insert(conn, schema.fact_bill, [asdict(row) for row in dataset.bills])

"""Stock movement + purchase-order simulation.

Runs *after* `sales.py` — demand is generated independent of on-hand stock (no
stockout-suppressed demand; a supply squeeze shows up as low/negative
`on_hand_after`, which is itself a valid signal). A refunded order line still
consumed stock at time of sale; refunds aren't modeled as restocking.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import timedelta

from ..config import GeneratorConfig
from ..entities import Entities
from ..facts import OrderLine, PurchaseOrder, StockMovement
from ..incidents.modifiers import IncidentModifiers
from ..rng import substream

__all__ = ["simulate_inventory"]

_INITIAL_DAYS_OF_COVER = 21
_REORDER_SAFETY_BUFFER_DAYS = 10
_REORDER_QTY_DAYS = 30


def simulate_inventory(
    config: GeneratorConfig,
    entities: Entities,
    order_lines: list[OrderLine],
    modifiers: IncidentModifiers,
) -> tuple[list[StockMovement], list[PurchaseOrder]]:
    sales_by_sku_date: dict[tuple[str, object], int] = defaultdict(int)
    total_by_sku: dict[str, int] = defaultdict(int)
    for line in order_lines:
        sales_by_sku_date[(line.sku, line.date)] += line.qty
        total_by_sku[line.sku] += line.qty

    movements: list[StockMovement] = []
    purchase_orders: list[PurchaseOrder] = []
    movement_seq = 0
    po_seq = 0

    dates = list(config.dates())
    supplier_by_id = entities.supplier_by_id

    for sku in entities.catalog:
        supplier = supplier_by_id[sku.supplier_id]
        avg_daily_qty = total_by_sku.get(sku.sku, 0) / config.day_count
        # Reorder point must cover at least this supplier's lead time + a safety
        # buffer, not a flat number of days — a slow supplier (up to ~50 days for
        # some countries) with a short flat reorder point chronically stocks out
        # before its replenishment arrives.
        cover_days = supplier.lead_time_days + _REORDER_SAFETY_BUFFER_DAYS
        initial_stock = max(1, math.ceil(avg_daily_qty * max(_INITIAL_DAYS_OF_COVER, cover_days)))
        reorder_point = math.ceil(avg_daily_qty * cover_days)
        reorder_qty = max(1, math.ceil(avg_daily_qty * max(_REORDER_QTY_DAYS, cover_days + 14)))
        rng = substream(config.seed, "inventory", sku.sku)

        on_hand = initial_stock
        movement_seq += 1
        movements.append(
            StockMovement(
                movement_id=f"MOV-{movement_seq:08d}",
                date=dates[0],
                sku=sku.sku,
                movement_type="initial",
                qty=initial_stock,
                on_hand_after=on_hand,
            )
        )

        open_po: PurchaseOrder | None = None
        for d in dates:
            if open_po is not None and open_po.received_date == d:
                on_hand += open_po.qty
                movement_seq += 1
                movements.append(
                    StockMovement(
                        movement_id=f"MOV-{movement_seq:08d}",
                        date=d,
                        sku=sku.sku,
                        movement_type="receipt",
                        qty=open_po.qty,
                        on_hand_after=on_hand,
                    )
                )
                open_po = None

            qty_sold = sales_by_sku_date.get((sku.sku, d), 0)
            if qty_sold:
                on_hand -= qty_sold
                movement_seq += 1
                movements.append(
                    StockMovement(
                        movement_id=f"MOV-{movement_seq:08d}",
                        date=d,
                        sku=sku.sku,
                        movement_type="sale",
                        qty=-qty_sold,
                        on_hand_after=on_hand,
                    )
                )

            if open_po is None and on_hand < reorder_point:
                extra_lead = modifiers.supplier_lead_extra(supplier.id, d)
                lead = max(1, round(rng.gauss(supplier.lead_time_days, supplier.lead_time_std_days)) + extra_lead)
                expected_date = d + timedelta(days=lead)
                on_time = rng.random() < supplier.on_time_rate
                received_date = expected_date if on_time else expected_date + timedelta(days=rng.randint(3, 10))
                po_seq += 1
                open_po = PurchaseOrder(
                    po_id=f"PO-{po_seq:07d}",
                    sku=sku.sku,
                    supplier_id=supplier.id,
                    ordered_date=d,
                    expected_date=expected_date,
                    received_date=received_date,
                    qty=reorder_qty,
                    unit_cost_sgd=sku.unit_cost_sgd,
                )
                purchase_orders.append(open_po)

    return movements, purchase_orders

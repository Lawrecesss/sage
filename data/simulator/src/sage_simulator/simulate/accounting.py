"""Invoices (AR, for credit-paying segments) and bills (AP, one per PO)."""

from __future__ import annotations

from datetime import timedelta

from ..config import GeneratorConfig
from ..entities import Entities
from ..facts import Bill, Invoice, OrderLine, PurchaseOrder
from ..rng import substream

__all__ = ["build_bills", "build_invoices"]

_INVOICE_NET_DAYS = 14
_PAID_JITTER_DAYS = (0, 0, 0, 3, 7, 14)


def build_invoices(config: GeneratorConfig, entities: Entities, order_lines: list[OrderLine]) -> list[Invoice]:
    rng = substream(config.seed, "accounting", "invoices")
    segment_by_name = entities.segment_by_name
    invoices: list[Invoice] = []
    seq = 0
    for line in order_lines:
        if line.is_refund:
            continue
        segment = segment_by_name[line.segment]
        if not segment.pays_on_credit:
            continue
        seq += 1
        due_date = line.date + timedelta(days=_INVOICE_NET_DAYS)
        paid_date = due_date + timedelta(days=rng.choice(_PAID_JITTER_DAYS))
        paid = paid_date <= config.end_date
        invoices.append(
            Invoice(
                invoice_id=f"INV-{seq:07d}",
                order_id=line.order_id,
                segment=line.segment,
                date=line.date,
                due_date=due_date,
                paid_date=paid_date if paid else None,
                amount_sgd=line.line_total_sgd,
                status="paid" if paid else "open",
            )
        )
    return invoices


def build_bills(config: GeneratorConfig, entities: Entities, purchase_orders: list[PurchaseOrder]) -> list[Bill]:
    rng = substream(config.seed, "accounting", "bills")
    supplier_by_id = entities.supplier_by_id
    bills: list[Bill] = []
    for seq, po in enumerate(purchase_orders, start=1):
        supplier = supplier_by_id[po.supplier_id]
        due_date = po.ordered_date + timedelta(days=supplier.payment_terms_days)
        paid_date = due_date + timedelta(days=rng.choice(_PAID_JITTER_DAYS))
        paid = paid_date <= config.end_date
        bills.append(
            Bill(
                bill_id=f"BILL-{seq:07d}",
                po_id=po.po_id,
                supplier_id=po.supplier_id,
                date=po.ordered_date,
                due_date=due_date,
                paid_date=paid_date if paid else None,
                amount_sgd=round(po.qty * po.unit_cost_sgd, 2),
                status="paid" if paid else "open",
            )
        )
    return bills

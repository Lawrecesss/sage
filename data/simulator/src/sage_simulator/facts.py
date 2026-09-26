"""Transactional row shapes the simulator produces and writes to Postgres.

Unlike `Supplier`/`Sku`/`CustomerSegment` (shared master data, `sage_models`),
these are facts — internal to `sage_simulator`, never imported by other
services. Other services read them back with SQL against the tables in
`db/schema.py`, the same rendezvous-through-the-database pattern already used
for master data.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass
class DateRow:
    date: date
    dow: str
    week: int
    month: int
    quarter: int
    year: int
    is_holiday: bool
    holiday_name: str | None


@dataclass
class OrderLine:
    order_id: str
    line_id: str
    date: date
    sku: str
    channel: str
    segment: str
    qty: int
    unit_price_sgd: float
    unit_cost_sgd: float  # snapshot at time of sale
    line_total_sgd: float
    is_refund: bool


@dataclass
class StockMovement:
    movement_id: str
    date: date
    sku: str
    movement_type: str  # "sale" | "receipt"
    qty: int  # negative for sale, positive for receipt
    on_hand_after: int


@dataclass
class PurchaseOrder:
    po_id: str
    sku: str
    supplier_id: str
    ordered_date: date
    expected_date: date
    received_date: date
    qty: int
    unit_cost_sgd: float


@dataclass
class Invoice:
    invoice_id: str
    order_id: str
    segment: str
    date: date
    due_date: date
    paid_date: date | None
    amount_sgd: float
    status: str  # "paid" | "open" | "overdue"


@dataclass
class Bill:
    bill_id: str
    po_id: str
    supplier_id: str
    date: date
    due_date: date
    paid_date: date | None
    amount_sgd: float
    status: str


@dataclass
class CustomerEnquiry:
    enquiry_id: str
    date: date  # opened
    contact_channel: str  # email | live_chat | phone | in_store | marketplace_chat
    segment: str
    topic: str  # order_status | return_refund | stock_availability | billing | product_question | complaint
    order_id: str | None
    sku: str | None
    priority: str  # low | normal | high
    status: str  # open | resolved | escalated
    first_response_hours: float
    resolved_date: date | None
    csat_score: int | None  # 1-5, resolved only


@dataclass
class OperationalUpdate:
    update_id: str
    date: date
    area: str  # logistics | supply | promotions | finance | store_ops | staffing | systems
    severity: str  # info | warning | critical
    title: str
    detail: str
    supplier_id: str | None
    channel: str | None
    category: str | None
    status: str  # open | resolved
    resolved_date: date | None


@dataclass
class Dataset:
    """Everything one `generate` run produces, ready to seed into Postgres."""

    dates: list[DateRow] = field(default_factory=list)
    order_lines: list[OrderLine] = field(default_factory=list)
    stock_movements: list[StockMovement] = field(default_factory=list)
    purchase_orders: list[PurchaseOrder] = field(default_factory=list)
    invoices: list[Invoice] = field(default_factory=list)
    bills: list[Bill] = field(default_factory=list)
    customer_enquiries: list[CustomerEnquiry] = field(default_factory=list)
    operational_updates: list[OperationalUpdate] = field(default_factory=list)

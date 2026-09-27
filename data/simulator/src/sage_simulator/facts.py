"""Transactional row shapes the simulator produces and writes to Postgres.

Unlike `Supplier`/`Sku`/`CustomerSegment` (shared master data, `sage_models`),
these are facts — internal to `sage_simulator`, never imported by other
services. Other services read them back with SQL against the tables in
`db/schema.py`, the same rendezvous-through-the-database pattern already used
for master data.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime


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
    """One customer contact and how it was handled.

    Only facts are stored: when it came in, its resolution target, and when it was
    first answered and resolved. Status ("open", "overdue", ...) never is — readers
    derive it as of their own "now", so the same rows answer both "what is overdue
    right now" and "what was overdue last Tuesday".
    """

    enquiry_id: str
    created_at: datetime  # timezone-aware
    channel: str  # the sales channel the customer bought from / contacted through
    contact_method: str  # "email" | "chat" | "phone" | "in_store" | "marketplace"
    segment: str
    topic: str  # see simulate/enquiries.py::TOPICS
    priority: str  # "urgent" | "high" | "normal" | "low"
    subject: str
    order_id: str | None
    sku: str | None
    value_at_stake_sgd: float | None  # the linked order line's value, if any
    due_at: datetime  # resolution target: created_at + the priority's SLA
    first_response_at: datetime | None  # None = not answered by the end of the run
    resolved_at: datetime | None  # None = still unresolved at the end of the run


@dataclass
class Dataset:
    """Everything one `generate` run produces, ready to seed into Postgres."""

    dates: list[DateRow] = field(default_factory=list)
    order_lines: list[OrderLine] = field(default_factory=list)
    stock_movements: list[StockMovement] = field(default_factory=list)
    purchase_orders: list[PurchaseOrder] = field(default_factory=list)
    invoices: list[Invoice] = field(default_factory=list)
    bills: list[Bill] = field(default_factory=list)
    enquiries: list[CustomerEnquiry] = field(default_factory=list)

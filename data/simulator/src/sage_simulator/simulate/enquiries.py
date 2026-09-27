"""Customer enquiries — the contacts customers raise about their orders and the range.

Most enquiries hang off a real order line (a late parcel, a damaged item, a refund
being chased, an invoice query), so they rise and fall with sales and with the
incident library's refund spikes; the rest are product and stock questions about a
SKU. Each gets a priority, a resolution target (``due_at``) from that priority's
SLA, and simulated first-response and resolution times.

Handling is drawn so every point in the run has a realistic backlog: most enquiries
are resolved inside their SLA, some run a little late, and a long tail drag on for
days. Those late and long-tail ones are what an "overdue enquiries" view finds as
of any given "now". Timestamps past the end of the run are left ``None`` (not
answered / not resolved yet), the same convention invoices and bills use for
``paid_date``.
"""

from __future__ import annotations

import random
from datetime import datetime, time, timedelta, timezone

from ..config import GeneratorConfig
from ..entities import Entities
from ..facts import CustomerEnquiry, OrderLine
from ..rng import substream

__all__ = ["PRIORITIES", "SLA_HOURS", "TOPICS", "build_enquiries"]

# Singapore has no DST, so a fixed offset is exact (and needs no tzdata on Windows).
_BUSINESS_TZ = timezone(timedelta(hours=8), "SGT")
_OPEN_HOUR, _CLOSE_HOUR = 9, 22  # when customers get in touch, business-local

TOPICS: tuple[str, ...] = (
    "order_status",
    "delivery_issue",
    "return_refund",
    "billing",
    "complaint",
    "product_question",
    "stock_availability",
)

PRIORITIES: tuple[str, ...] = ("urgent", "high", "normal", "low")  # most to least urgent
# Resolution target per priority, hours from created_at.
SLA_HOURS = {"urgent": 4, "high": 24, "normal": 48, "low": 72}
# Typical time to a first reply, hours (the mean of an exponential draw).
_FIRST_RESPONSE_MEAN_HOURS = {"urgent": 0.5, "high": 2.0, "normal": 6.0, "low": 12.0}

# Base priority mix per topic, in PRIORITIES order.
_TOPIC_PRIORITY_WEIGHTS = {
    "order_status": (0.02, 0.18, 0.65, 0.15),
    "delivery_issue": (0.10, 0.50, 0.35, 0.05),
    "return_refund": (0.05, 0.35, 0.50, 0.10),
    "billing": (0.05, 0.35, 0.50, 0.10),
    "complaint": (0.30, 0.50, 0.18, 0.02),
    "product_question": (0.0, 0.05, 0.45, 0.50),
    "stock_availability": (0.0, 0.05, 0.35, 0.60),
}

# Chance an order line raises an enquiry of each order-linked topic.
_ORDER_STATUS_RATE = 0.05  # online orders only
_DELIVERY_ISSUE_RATE = 0.015  # online orders only
_COMPLAINT_RATE = 0.006
_REFUND_ENQUIRY_RATE = 0.55  # of refund lines
_BILLING_RATE = 0.08  # of orders from credit-paying segments
# Product/stock questions not tied to an order: expected count per day across the business.
_SKU_QUESTIONS_PER_DAY = 4.0

# Resolution outcome mix: inside SLA / a little late / long tail.
_ON_TIME_SHARE = 0.72
_LATE_SHARE = 0.18
_LONG_TAIL_MEAN_DAYS = 5.0
_LONG_TAIL_CAP_DAYS = 30.0
# Chance the first reply itself stalls for days (a missed inbox, a lost ticket).
_STALLED_RESPONSE_SHARE = 0.04

_VALUE_BUMP_SGD = 500.0  # a linked order line worth more than this bumps priority one level

_CONTACT_METHODS = {
    "outlet": (("in_store", "phone", "email"), (0.45, 0.30, 0.25)),
    "shopify": (("email", "chat", "phone"), (0.50, 0.40, 0.10)),
}
_MARKETPLACE_CONTACT = (("marketplace", "email"), (0.85, 0.15))

_SUBJECTS = {
    "order_status": ("Where is my order {order}?", "No tracking update for {order}", "Order {order} still not shipped"),
    "delivery_issue": ("{name} arrived damaged ({order})", "Wrong item received for {order}", "Parcel for {order} marked delivered but not received"),
    "return_refund": ("Refund not received for {order}", "Return request: {name}", "Chasing refund status on {order}"),
    "billing": ("Invoice query on {order}", "Requesting statement for {order}", "Payment terms query on {order}"),
    "complaint": ("Complaint about {name} ({order})", "Unhappy with service on {order}", "Escalation: {order}"),
    "product_question": ("Question about {name}", "Dimensions/materials for {name}", "Is {name} suitable as a gift?"),
    "stock_availability": ("When will {name} be back in stock?", "Can I reserve {name}?", "Is {name} available in store?"),
}


def _local(d, rng: random.Random) -> datetime:
    """A random moment during contact hours on local date `d`."""
    minutes = rng.randrange((_CLOSE_HOUR - _OPEN_HOUR) * 60)
    return datetime.combine(d, time(_OPEN_HOUR), tzinfo=_BUSINESS_TZ) + timedelta(minutes=minutes)


def _priority(topic: str, value: float | None, credit_customer: bool, rng: random.Random) -> str:
    level = rng.choices(range(len(PRIORITIES)), weights=_TOPIC_PRIORITY_WEIGHTS[topic], k=1)[0]
    if (value is not None and value > _VALUE_BUMP_SGD) or credit_customer:
        level = max(0, level - 1)
    return PRIORITIES[level]


def _contact_method(channel: str, rng: random.Random) -> str:
    methods, weights = _CONTACT_METHODS.get(channel, _MARKETPLACE_CONTACT)
    return rng.choices(methods, weights=weights, k=1)[0]


def _handling(created: datetime, priority: str, rng: random.Random) -> tuple[datetime, datetime, datetime]:
    """(due_at, first_response_at, resolved_at) — unclipped to the run's end."""
    sla = timedelta(hours=SLA_HOURS[priority])
    due = created + sla

    if rng.random() < _STALLED_RESPONSE_SHARE:
        first = created + timedelta(days=rng.uniform(1.0, 6.0))
    else:
        first = created + timedelta(hours=rng.expovariate(1 / _FIRST_RESPONSE_MEAN_HOURS[priority]))

    outcome = rng.random()
    if outcome < _ON_TIME_SHARE:
        resolved = created + sla * rng.uniform(0.15, 0.95)
    elif outcome < _ON_TIME_SHARE + _LATE_SHARE:
        resolved = created + sla * rng.uniform(1.05, 2.0)
    else:
        extra_days = min(_LONG_TAIL_CAP_DAYS, rng.expovariate(1 / _LONG_TAIL_MEAN_DAYS))
        resolved = due + timedelta(days=max(0.5, extra_days))
    # Can't be resolved before anyone replied.
    resolved = max(resolved, first + timedelta(minutes=rng.randrange(5, 90)))
    return due, first, resolved


def build_enquiries(
    config: GeneratorConfig, entities: Entities, order_lines: list[OrderLine]
) -> list[CustomerEnquiry]:
    rng = substream(config.seed, "enquiries")
    sku_by_id = entities.sku_by_id
    segment_by_name = entities.segment_by_name
    run_end = datetime.combine(config.end_date + timedelta(days=1), time(0), tzinfo=_BUSINESS_TZ)

    # (created_at, topic, channel, segment, order_id, sku, value) before ids/handling are drawn.
    drafts: list[tuple[datetime, str, str, str, str | None, str | None, float | None]] = []

    for line in order_lines:
        online = line.channel != "outlet"
        credit = segment_by_name[line.segment].pays_on_credit
        linked = (line.channel, line.segment, line.order_id, line.sku, line.line_total_sgd)
        if line.is_refund:
            if rng.random() < _REFUND_ENQUIRY_RATE:
                drafts.append((_local(line.date + timedelta(days=rng.randint(0, 3)), rng), "return_refund", *linked))
            continue
        if online and rng.random() < _ORDER_STATUS_RATE:
            drafts.append((_local(line.date + timedelta(days=rng.randint(2, 6)), rng), "order_status", *linked))
        if online and rng.random() < _DELIVERY_ISSUE_RATE:
            drafts.append((_local(line.date + timedelta(days=rng.randint(2, 7)), rng), "delivery_issue", *linked))
        if rng.random() < _COMPLAINT_RATE:
            drafts.append((_local(line.date + timedelta(days=rng.randint(0, 5)), rng), "complaint", *linked))
        if credit and rng.random() < _BILLING_RATE:
            drafts.append((_local(line.date + timedelta(days=rng.randint(7, 20)), rng), "billing", *linked))

    catalog = entities.catalog
    demand = [s.demand_weight for s in catalog]
    segments = entities.segments
    segment_weights = [s.order_share for s in segments]
    channels = [c.name for c in config.channels]
    channel_weights = [c.revenue_share for c in config.channels]
    for d in config.dates():
        # Poisson-ish count via summed Bernoulli draws — deterministic, no numpy needed.
        count = sum(rng.random() < _SKU_QUESTIONS_PER_DAY / 12 for _ in range(12))
        for _ in range(count):
            sku = rng.choices(catalog, weights=demand, k=1)[0]
            topic = "stock_availability" if rng.random() < 0.45 else "product_question"
            channel = rng.choices(channels, weights=channel_weights, k=1)[0]
            segment = rng.choices(segments, weights=segment_weights, k=1)[0].name
            drafts.append((_local(d, rng), topic, channel, segment, None, sku.sku, None))

    drafts = [d for d in drafts if d[0] < run_end]
    drafts.sort(key=lambda d: (d[0], d[1], d[4] or "", d[5] or ""))

    enquiries: list[CustomerEnquiry] = []
    for seq, (created, topic, channel, segment, order_id, sku_id, value) in enumerate(drafts, start=1):
        credit = segment_by_name[segment].pays_on_credit
        priority = _priority(topic, value, credit, rng)
        due, first, resolved = _handling(created, priority, rng)
        name = sku_by_id[sku_id].name if sku_id else "item"
        subject = rng.choice(_SUBJECTS[topic]).format(order=order_id or "", name=name)
        enquiries.append(
            CustomerEnquiry(
                enquiry_id=f"ENQ-{seq:07d}",
                created_at=created,
                channel=channel,
                contact_method=_contact_method(channel, rng),
                segment=segment,
                topic=topic,
                priority=priority,
                subject=subject,
                order_id=order_id,
                sku=sku_id,
                value_at_stake_sgd=round(value, 2) if value is not None else None,
                due_at=due,
                first_response_at=first if first < run_end else None,
                resolved_at=resolved if resolved < run_end else None,
            )
        )
    return enquiries

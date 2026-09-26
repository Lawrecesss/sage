"""Customer enquiries — derived from facts the rest of the pipeline already
produced, not their own independent random stream. A refund line becomes a
`return_refund` enquiry, an order on a supply-disrupted SKU becomes an
`order_status` enquiry, negative `on_hand_after` becomes a `stock_availability`
enquiry, and so on. This means incidents and genuine supply/return spikes
already in the dataset show up here automatically, without this module
needing its own coupling to the incident-modifier machinery.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from ..config import GeneratorConfig
from ..entities import Entities
from ..facts import CustomerEnquiry, Dataset
from ..incidents.schema import Incident, IncidentType
from ..rng import substream

__all__ = ["build_customer_enquiries"]

_CONTACT_CHANNEL_BY_SALES_CHANNEL: dict[str, tuple[str, ...]] = {
    "outlet": ("in_store", "phone"),
    "shopify": ("email", "live_chat"),
    "lazada": ("marketplace_chat",),
    "shopee": ("marketplace_chat",),
}
_DEFAULT_CONTACT_CHANNELS: tuple[str, ...] = ("email", "phone")

_BASE_ORDER_STATUS_RATE = 0.015
_DISRUPTED_ORDER_STATUS_RATE = 0.18
_RETURN_ENQUIRY_RATE = 0.60
_STOCKOUT_ENQUIRY_RATE = 0.08
_LATE_BILLING_ENQUIRY_RATE = 0.50
_PRODUCT_QUESTION_RATE = 0.008
_COMPLAINT_ESCALATION_RATE = 0.20  # of disrupted order_status enquiries

_RESPONSE_HOURS_BY_PRIORITY: dict[str, tuple[float, float]] = {
    "high": (2.0, 8.0),
    "normal": (6.0, 24.0),
    "low": (12.0, 48.0),
}
_RESOLUTION_DAYS_BY_TOPIC: dict[str, tuple[int, int]] = {
    "order_status": (0, 2),
    "return_refund": (3, 10),
    "stock_availability": (1, 4),
    "billing": (4, 14),
    "product_question": (0, 1),
    "complaint": (5, 14),
}
_ESCALATE_AFTER_DAYS_OPEN = 7


def _contact_channel(rng, sales_channel: str) -> str:
    options = _CONTACT_CHANNEL_BY_SALES_CHANNEL.get(sales_channel, _DEFAULT_CONTACT_CHANNELS)
    return rng.choice(options)


def _resolve(
    rng, topic: str, opened: date, priority: str, config: GeneratorConfig
) -> tuple[str, float, date | None, int | None]:
    """Draws a first-response time and a resolution outcome for one enquiry."""
    lo, hi = _RESPONSE_HOURS_BY_PRIORITY[priority]
    first_response = round(rng.uniform(lo, hi), 1)

    d_lo, d_hi = _RESOLUTION_DAYS_BY_TOPIC[topic]
    resolve_days = rng.randint(d_lo, d_hi)
    resolved_date = opened + timedelta(days=resolve_days)
    if resolved_date > config.end_date:
        days_open = (config.end_date - opened).days
        status = "escalated" if priority == "high" and days_open >= _ESCALATE_AFTER_DAYS_OPEN else "open"
        return status, first_response, None, None

    csat = (3 if topic == "complaint" else 5) - (1 if resolve_days > (d_lo + d_hi) / 2 else 0)
    csat = max(1, min(5, csat + rng.randint(-1, 1)))
    return "resolved", first_response, resolved_date, csat


def build_customer_enquiries(
    config: GeneratorConfig,
    entities: Entities,
    dataset: Dataset,
    incidents: tuple[Incident, ...],
) -> list[CustomerEnquiry]:
    rng = substream(config.seed, "enquiries")

    # SUPPLIER_DELAY incidents push out expected_date rather than making the PO
    # late (see incidents/modifiers.py), so the late-PO check below alone would
    # miss them -- track their windows per affected sku separately.
    incident_disrupted_skus: list[tuple[date, date, set[str]]] = []
    for incident in incidents:
        if incident.type is not IncidentType.SUPPLIER_DELAY:
            continue
        supplier_ids = set(incident.affected_entities.get("supplier", []))
        skus = {sku.sku for sku in entities.catalog if sku.supplier_id in supplier_ids}
        if skus:
            incident_disrupted_skus.append((incident.window_start, incident.window_end, skus))

    # Genuinely late purchase orders (any supplier, not just planted incidents).
    late_po_windows: dict[str, list[tuple[date, date]]] = defaultdict(list)
    for po in dataset.purchase_orders:
        if po.received_date > po.expected_date:
            late_po_windows[po.sku].append((po.expected_date, po.received_date - timedelta(days=1)))

    def _is_disrupted(sku: str, d: date) -> bool:
        for start, end, skus in incident_disrupted_skus:
            if sku in skus and start <= d <= end:
                return True
        return any(start <= d <= end for start, end in late_po_windows.get(sku, ()))

    enquiries: list[CustomerEnquiry] = []

    for line in dataset.order_lines:
        if line.is_refund:
            if rng.random() < _RETURN_ENQUIRY_RATE:
                opened = min(line.date + timedelta(days=rng.randint(1, 10)), config.end_date)
                priority = "normal"
                status, first_response, resolved_date, csat = _resolve(rng, "return_refund", opened, priority, config)
                enquiries.append(
                    CustomerEnquiry(
                        enquiry_id="",
                        date=opened,
                        contact_channel=_contact_channel(rng, line.channel),
                        segment=line.segment,
                        topic="return_refund",
                        order_id=line.order_id,
                        sku=line.sku,
                        priority=priority,
                        status=status,
                        first_response_hours=first_response,
                        resolved_date=resolved_date,
                        csat_score=csat,
                    )
                )
            continue

        disrupted = _is_disrupted(line.sku, line.date)
        if rng.random() < (_DISRUPTED_ORDER_STATUS_RATE if disrupted else _BASE_ORDER_STATUS_RATE):
            opened = min(line.date + timedelta(days=rng.randint(1, 5)), config.end_date)
            topic = "order_status"
            priority = "high" if disrupted else "normal"
            if disrupted and rng.random() < _COMPLAINT_ESCALATION_RATE:
                topic = "complaint"
            status, first_response, resolved_date, csat = _resolve(rng, topic, opened, priority, config)
            enquiries.append(
                CustomerEnquiry(
                    enquiry_id="",
                    date=opened,
                    contact_channel=_contact_channel(rng, line.channel),
                    segment=line.segment,
                    topic=topic,
                    order_id=line.order_id,
                    sku=line.sku,
                    priority=priority,
                    status=status,
                    first_response_hours=first_response,
                    resolved_date=resolved_date,
                    csat_score=csat,
                )
            )
        elif rng.random() < _PRODUCT_QUESTION_RATE:
            priority = "low"
            status, first_response, resolved_date, csat = _resolve(rng, "product_question", line.date, priority, config)
            enquiries.append(
                CustomerEnquiry(
                    enquiry_id="",
                    date=line.date,
                    contact_channel=_contact_channel(rng, line.channel),
                    segment=line.segment,
                    topic="product_question",
                    order_id=line.order_id,
                    sku=line.sku,
                    priority=priority,
                    status=status,
                    first_response_hours=first_response,
                    resolved_date=resolved_date,
                    csat_score=csat,
                )
            )

    # Unmet demand (sales aren't stock-gated -- see simulate/inventory.py) shows
    # up as negative on_hand_after; not every such sale generates an enquiry.
    segments = entities.segments
    segment_weights = [s.order_share for s in segments]
    for movement in dataset.stock_movements:
        if movement.movement_type != "sale" or movement.on_hand_after >= 0:
            continue
        if rng.random() >= _STOCKOUT_ENQUIRY_RATE:
            continue
        segment = rng.choices(segments, weights=segment_weights, k=1)[0]
        priority = "normal"
        status, first_response, resolved_date, csat = _resolve(
            rng, "stock_availability", movement.date, priority, config
        )
        enquiries.append(
            CustomerEnquiry(
                enquiry_id="",
                date=movement.date,
                contact_channel=rng.choice(_DEFAULT_CONTACT_CHANNELS),
                segment=segment.name,
                topic="stock_availability",
                order_id=None,
                sku=movement.sku,
                priority=priority,
                status=status,
                first_response_hours=first_response,
                resolved_date=resolved_date,
                csat_score=csat,
            )
        )

    # Unpaid invoices -- "overdue" (set by the ar_ageing_blowout incident, see
    # incidents/apply.py) gets a higher priority than plain "open".
    for invoice in dataset.invoices:
        if invoice.status == "paid" or rng.random() >= _LATE_BILLING_ENQUIRY_RATE:
            continue
        opened = min(invoice.due_date + timedelta(days=rng.randint(1, 10)), config.end_date)
        opened = max(opened, config.start_date)
        priority = "high" if invoice.status == "overdue" else "normal"
        status, first_response, resolved_date, csat = _resolve(rng, "billing", opened, priority, config)
        enquiries.append(
            CustomerEnquiry(
                enquiry_id="",
                date=opened,
                contact_channel=rng.choice(_DEFAULT_CONTACT_CHANNELS),
                segment=invoice.segment,
                topic="billing",
                order_id=invoice.order_id,
                sku=None,
                priority=priority,
                status=status,
                first_response_hours=first_response,
                resolved_date=resolved_date,
                csat_score=csat,
            )
        )

    enquiries.sort(key=lambda e: (e.date, e.order_id or "", e.sku or ""))
    for i, enquiry in enumerate(enquiries, start=1):
        enquiry.enquiry_id = f"ENQ-{i:07d}"
    return enquiries

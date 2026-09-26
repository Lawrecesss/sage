"""Operational updates — a curated internal ops log, not a raw event stream.

Three sources: incidents that ops staff would plausibly notice and write down,
seasonal campaign launches, and a small deterministic cadence of routine
business-as-usual entries. Incident types meant to stay hidden from the agent
(price_error, returns_spike, seasonal_shift, channel_mix_shift,
dead_stock_buildup) are deliberately never logged here -- naming them in an
ops feed would give away the eval ground truth in `incidents/library.py`.
"""

from __future__ import annotations

from datetime import date, timedelta

from ..config import GeneratorConfig
from ..entities import Entities
from ..facts import OperationalUpdate
from ..incidents.schema import Incident, IncidentType
from ..rng import substream

__all__ = ["build_operational_updates"]

_STAFFING_DEPARTMENTS: tuple[str, ...] = ("Warehouse", "Customer Service", "Store Ops", "Finance")


def _clip(d: date, config: GeneratorConfig) -> date:
    return min(max(d, config.start_date), config.end_date)


def _month_starts(config: GeneratorConfig):
    d = date(config.start_date.year, config.start_date.month, 1)
    while d <= config.end_date:
        yield d
        d = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)


def build_operational_updates(
    config: GeneratorConfig, entities: Entities, incidents: tuple[Incident, ...]
) -> list[OperationalUpdate]:
    rng = substream(config.seed, "operations")
    sku_by_id = entities.sku_by_id
    supplier_by_id = entities.supplier_by_id

    updates: list[OperationalUpdate] = []

    def _add(
        d: date,
        area: str,
        severity: str,
        title: str,
        detail: str,
        *,
        supplier_id: str | None = None,
        channel: str | None = None,
        category: str | None = None,
        resolved_date: date | None = None,
    ) -> None:
        d = _clip(d, config)
        if resolved_date is not None:
            resolved_date = max(_clip(resolved_date, config), d)
        updates.append(
            OperationalUpdate(
                update_id="",
                date=d,
                area=area,
                severity=severity,
                title=title,
                detail=detail,
                supplier_id=supplier_id,
                channel=channel,
                category=category,
                status="resolved" if resolved_date is not None else "open",
                resolved_date=resolved_date,
            )
        )

    # 1. Incidents ops staff would plausibly notice and write down.
    for incident in incidents:
        if incident.type is IncidentType.SUPPLIER_DELAY:
            supplier_id = next(iter(incident.affected_entities.get("supplier", ())), None)
            supplier = supplier_by_id.get(supplier_id) if supplier_id else None
            name = supplier.name if supplier is not None else "a supplier"
            lead_in = min(3, max(0, (incident.window_end - incident.window_start).days // 4))
            _add(
                incident.window_start + timedelta(days=lead_in),
                "logistics",
                "warning",
                f"Shipment delays reported from {name}",
                f"{name} has flagged longer lead times on current orders; downstream deliveries may run behind schedule.",
                supplier_id=supplier_id,
                resolved_date=incident.window_end if incident.window_end < config.end_date else None,
            )
        elif incident.type is IncidentType.COGS_CREEP:
            sku_id = next(iter(incident.affected_entities.get("sku", ())), None)
            sku = sku_by_id.get(sku_id) if sku_id else None
            if sku is not None:
                _add(
                    incident.window_start,
                    "supply",
                    "info",
                    f"Updated cost pricing received for {sku.category}",
                    f"Supplier issued a revised price list affecting {sku.sku} and related lines.",
                    supplier_id=sku.supplier_id,
                    category=sku.category,
                    resolved_date=incident.window_start,
                )
        elif incident.type is IncidentType.MARGIN_KILLING_DISCOUNT:
            categories = incident.affected_entities.get("category", ())
            category = categories[0] if categories else None
            suffix = f" on {category}" if category else ""
            _add(
                incident.window_start,
                "promotions",
                "info",
                "Promotional discount campaign launched",
                f"A targeted discount campaign is running{suffix}.",
                category=category,
                resolved_date=incident.window_end if incident.window_end < config.end_date else None,
            )
        elif incident.type is IncidentType.AR_AGEING_BLOWOUT:
            _add(
                incident.window_start,
                "finance",
                "warning",
                "Extended payment terms granted to a key account",
                "Finance approved longer payment terms for a trade account; expect receivables to age further out than usual.",
                resolved_date=incident.window_end if incident.window_end < config.end_date else None,
            )

    # 2. Seasonal campaign launches.
    for event in config.events_in_window:
        _add(
            event.start,
            "promotions",
            "info",
            f"{event.name} campaign live",
            f"Seasonal promotion for {event.name} is running across the storefront.",
            resolved_date=event.end,
        )

    # 3. Routine background cadence -- deterministic, implies no sales effect.
    for month, month_start in enumerate(_month_starts(config)):
        stocktake_date = month_start + timedelta(days=rng.randint(0, 4))
        if config.start_date <= stocktake_date <= config.end_date:
            _add(
                stocktake_date,
                "store_ops",
                "info",
                "Monthly stocktake completed",
                "Routine stock count completed with no material discrepancies.",
                resolved_date=stocktake_date,
            )
        if month % 2 == 0:
            dept = rng.choice(_STAFFING_DEPARTMENTS)
            hire_date = month_start + timedelta(days=rng.randint(0, 27))
            if config.start_date <= hire_date <= config.end_date:
                _add(
                    hire_date,
                    "staffing",
                    "info",
                    f"New team member onboarded in {dept}",
                    "Headcount change logged for planning purposes; no customer impact.",
                    resolved_date=hire_date,
                )
        if month % 3 == 1:
            maint_date = month_start + timedelta(days=rng.randint(0, 27))
            if config.start_date <= maint_date <= config.end_date:
                _add(
                    maint_date,
                    "systems",
                    "info",
                    "Scheduled point-of-sale maintenance window",
                    "Planned maintenance completed outside business hours; no customer impact.",
                    resolved_date=maint_date,
                )

    updates.sort(key=lambda u: u.date)
    for i, update in enumerate(updates, start=1):
        update.update_id = f"OPS-{i:05d}"
    return updates

"""Post-hoc incident perturbations.

These incident types only touch price/cost/refund-flag/payment-date fields —
none of them change a quantity that something else derives from (stock levels,
order volume), so it's safe to patch them onto the finished `Dataset` after
generation. (The other four incident types *do* cascade into quantities and
are handled earlier, during generation — see `modifiers.py`.)
"""

from __future__ import annotations

from datetime import timedelta

from sage_models import Sku

from ..config import GeneratorConfig
from ..facts import Dataset
from ..rng import substream
from .schema import Incident, IncidentType

__all__ = ["apply_posthoc"]


def apply_posthoc(
    incidents: tuple[Incident, ...],
    dataset: Dataset,
    sku_by_id: dict[str, Sku],
    config: GeneratorConfig,
) -> None:
    """Mutates `dataset` in place."""
    for incident in incidents:
        window = (incident.window_start, incident.window_end)
        if incident.type is IncidentType.PRICE_ERROR:
            _price_error(dataset, incident.affected_entities.get("sku", []), window)
        elif incident.type is IncidentType.COGS_CREEP:
            _cogs_creep(dataset, incident.affected_entities.get("sku", []), window)
        elif incident.type is IncidentType.RETURNS_SPIKE:
            _returns_spike(dataset, incident.affected_entities.get("segment", []), window, config, incident.id)
        elif incident.type is IncidentType.MARGIN_KILLING_DISCOUNT:
            _margin_killing_discount(
                dataset,
                incident.affected_entities.get("segment", []),
                incident.affected_entities.get("category", []),
                window,
                sku_by_id,
            )
        elif incident.type is IncidentType.AR_AGEING_BLOWOUT:
            _ar_ageing_blowout(dataset, incident.affected_entities.get("segment", []), window, config)


def _in_window(d, window: tuple) -> bool:
    return window[0] <= d <= window[1]


def _price_error(dataset: Dataset, skus: list[str], window: tuple) -> None:
    for line in dataset.order_lines:
        if line.sku in skus and _in_window(line.date, window) and not line.is_refund:
            line.unit_price_sgd = round(line.unit_price_sgd * 0.5, 2)
            line.line_total_sgd = round(line.unit_price_sgd * line.qty, 2)


def _cogs_creep(dataset: Dataset, skus: list[str], window: tuple) -> None:
    for line in dataset.order_lines:
        if line.sku in skus and _in_window(line.date, window):
            line.unit_cost_sgd = round(line.unit_cost_sgd * 1.35, 2)


def _returns_spike(dataset: Dataset, segments: list[str], window: tuple, config: GeneratorConfig, incident_id: str) -> None:
    rng = substream(config.seed, "incident", incident_id)
    for line in dataset.order_lines:
        if (
            line.segment in segments
            and _in_window(line.date, window)
            and not line.is_refund
            and rng.random() < 0.35
        ):
            line.is_refund = True


def _margin_killing_discount(
    dataset: Dataset,
    segments: list[str],
    categories: list[str],
    window: tuple,
    sku_by_id: dict[str, Sku],
) -> None:
    for line in dataset.order_lines:
        if line.segment not in segments or not _in_window(line.date, window) or line.is_refund:
            continue
        sku = sku_by_id.get(line.sku)
        if sku is not None and sku.category in categories:
            line.unit_price_sgd = round(line.unit_price_sgd * 0.8, 2)
            line.line_total_sgd = round(line.unit_price_sgd * line.qty, 2)


def _ar_ageing_blowout(dataset: Dataset, segments: list[str], window: tuple, config: GeneratorConfig) -> None:
    for invoice in dataset.invoices:
        if invoice.segment in segments and _in_window(invoice.date, window):
            invoice.due_date = invoice.due_date + timedelta(days=30)
            if invoice.paid_date is not None:
                invoice.paid_date = invoice.paid_date + timedelta(days=30)
            invoice.status = "overdue" if invoice.due_date < config.end_date else "open"

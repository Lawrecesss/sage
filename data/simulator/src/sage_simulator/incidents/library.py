"""The default planted-incident library for a seeded demo run.

No YAML authoring tool (that's a bigger, separate feature) — incidents are
built directly from the run's own generated `Entities` so they always
reference suppliers/SKUs/segments that actually exist for this config,
regardless of `sku_count`/`supplier_count`.
"""

from __future__ import annotations

from datetime import date, timedelta

from sage_models import Supplier

from ..config import GeneratorConfig
from ..entities import Entities
from .schema import Difficulty, Incident, IncidentType

__all__ = ["build_default_incidents"]


def _window(config: GeneratorConfig, start_frac: float, length_days: int) -> tuple[date, date]:
    start = config.start_date + timedelta(days=int(config.day_count * start_frac))
    end = min(start + timedelta(days=length_days), config.end_date)
    return start, end


def build_default_incidents(config: GeneratorConfig, entities: Entities) -> tuple[Incident, ...]:
    """One incident per `IncidentType`, targeting real entities from this run."""
    suppliers = entities.suppliers
    catalog = entities.catalog
    segments = entities.segments
    categories = list(config.categories)

    supplier: Supplier = suppliers[0]
    credit_segment = next((s for s in segments if s.pays_on_credit), segments[-1])

    return (
        Incident(
            id="inc-supplier-delay",
            type=IncidentType.SUPPLIER_DELAY,
            difficulty=Difficulty.OBVIOUS,
            window_start=(w := _window(config, 0.55, 21))[0],
            window_end=w[1],
            affected_entities={"supplier": [supplier.id]},
        ),
        Incident(
            id="inc-price-error",
            type=IncidentType.PRICE_ERROR,
            difficulty=Difficulty.OBVIOUS,
            window_start=(w := _window(config, 0.10, 7))[0],
            window_end=w[1],
            affected_entities={"sku": [catalog[0 % len(catalog)].sku]},
        ),
        Incident(
            id="inc-cogs-creep",
            type=IncidentType.COGS_CREEP,
            difficulty=Difficulty.SUBTLE,
            window_start=(w := _window(config, 0.30, 60))[0],
            window_end=w[1],
            affected_entities={"sku": [catalog[1 % len(catalog)].sku]},
        ),
        Incident(
            id="inc-returns-spike",
            type=IncidentType.RETURNS_SPIKE,
            difficulty=Difficulty.OBVIOUS,
            window_start=(w := _window(config, 0.40, 14))[0],
            window_end=w[1],
            affected_entities={"segment": [segments[-1 % len(segments)].name]},
        ),
        Incident(
            id="inc-ar-ageing-blowout",
            type=IncidentType.AR_AGEING_BLOWOUT,
            difficulty=Difficulty.SUBTLE,
            window_start=(w := _window(config, 0.60, 30))[0],
            window_end=w[1],
            affected_entities={"segment": [credit_segment.name]},
        ),
        Incident(
            id="inc-margin-killing-discount",
            type=IncidentType.MARGIN_KILLING_DISCOUNT,
            difficulty=Difficulty.SUBTLE,
            window_start=(w := _window(config, 0.20, 14))[0],
            window_end=w[1],
            affected_entities={
                "segment": [segments[0 % len(segments)].name],
                "category": [categories[0 % len(categories)]],
            },
        ),
        Incident(
            id="inc-seasonal-shift",
            type=IncidentType.SEASONAL_SHIFT,
            difficulty=Difficulty.CROSS_DOMAIN_ONLY,
            window_start=(w := _window(config, 0.75, 21))[0],
            window_end=w[1],
            affected_entities={"category": [categories[1 % len(categories)]]},
        ),
        Incident(
            id="inc-channel-mix-shift",
            type=IncidentType.CHANNEL_MIX_SHIFT,
            difficulty=Difficulty.SUBTLE,
            window_start=(w := _window(config, 0.50, 30))[0],
            window_end=w[1],
            affected_entities={"channel": [config.channels[0].name]},
        ),
        Incident(
            id="inc-dead-stock-buildup",
            type=IncidentType.DEAD_STOCK_BUILDUP,
            difficulty=Difficulty.OBVIOUS,
            window_start=(w := _window(config, 0.65, max(1, int(config.day_count * 0.30))))[0],
            window_end=w[1],
            affected_entities={"sku": [catalog[2 % len(catalog)].sku]},
        ),
    )

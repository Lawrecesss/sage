"""Day-by-day demand engine — the biggest simplification in this simulator:
one order = one order line (a single SKU), not an itemized multi-line basket.
Good enough for a seeded demo dataset; stockouts are not modeled (`sales.py`
generates demand independent of on-hand stock — see `inventory.py`).
"""

from __future__ import annotations

from ..config import GeneratorConfig
from ..entities import Entities
from ..facts import OrderLine
from ..incidents.modifiers import IncidentModifiers
from ..rng import substream

__all__ = ["build_order_lines"]

_AVG_DAYS_IN_MONTH = 30.44


def build_order_lines(
    config: GeneratorConfig, entities: Entities, modifiers: IncidentModifiers
) -> list[OrderLine]:
    catalog = entities.catalog
    segments = entities.segments
    segment_weights = [s.order_share for s in segments]

    order_lines: list[OrderLine] = []
    order_seq = 0

    for d in config.dates():
        months_elapsed = (d - config.start_date).days / _AVG_DAYS_IN_MONTH
        growth = (1 + config.monthly_growth_rate) ** months_elapsed
        weekday_mult = config.weekday_multipliers[d.weekday()]

        active_events = [e for e in config.events_in_window if e.start <= d <= e.end]
        seasonal_mult = max((e.demand_multiplier for e in active_events), default=1.0)
        seasonal_discount_uplift = max((e.discount_uplift for e in active_events), default=0.0)
        boost_all = any(e.categories is None for e in active_events)
        boosted_categories = {c for e in active_events if e.categories for c in e.categories}

        candidates = []
        weights = []
        for sku in catalog:
            if modifiers.is_demand_suppressed(sku.sku, d):
                weights.append(sku.demand_weight * 0.02)
            elif (cat_mult := modifiers.category_multiplier(sku.category, d)) is not None:
                weights.append(sku.demand_weight * cat_mult)
            elif not boost_all and boosted_categories and sku.category not in boosted_categories:
                weights.append(sku.demand_weight * 0.3)
            else:
                weights.append(sku.demand_weight)
            candidates.append(sku)

        day_rng = substream(config.seed, "sales", d.isoformat())

        for channel in config.channels:
            base_daily = config.target_monthly_revenue_sgd * channel.revenue_share / _AVG_DAYS_IN_MONTH
            noise = max(0.05, 1.0 + day_rng.gauss(0, config.daily_noise_cv))
            channel_mult = modifiers.channel_multiplier(channel.name, d)
            day_channel_revenue = base_daily * growth * weekday_mult * seasonal_mult * noise * channel_mult

            order_count = max(0, round(day_channel_revenue / channel.avg_order_value_sgd))
            for _ in range(order_count):
                order_seq += 1
                segment = day_rng.choices(segments, weights=segment_weights, k=1)[0]
                sku = day_rng.choices(candidates, weights=weights, k=1)[0]

                discount_rate = min(
                    0.6,
                    channel.baseline_discount_rate
                    + segment.discount_affinity * 0.15
                    + seasonal_discount_uplift,
                )
                unit_price = round(sku.list_price_sgd * (1 - discount_rate), 2)
                # Tie basket value to the configured AOV (scaled by the segment's
                # aov_multiplier) rather than picking qty independently of price —
                # otherwise realized revenue drifts away from `target_monthly_revenue_sgd`.
                basket_target = channel.avg_order_value_sgd * segment.aov_multiplier * (1 + day_rng.uniform(-0.2, 0.2))
                units = max(1, round(basket_target / unit_price))
                is_refund = day_rng.random() < (channel.return_rate * segment.return_rate_multiplier)

                order_lines.append(
                    OrderLine(
                        order_id=f"ORD-{order_seq:07d}",
                        line_id="1",
                        date=d,
                        sku=sku.sku,
                        channel=channel.name,
                        segment=segment.name,
                        qty=units,
                        unit_price_sgd=unit_price,
                        unit_cost_sgd=sku.unit_cost_sgd,
                        line_total_sgd=round(unit_price * units, 2),
                        is_refund=is_refund,
                    )
                )
    return order_lines

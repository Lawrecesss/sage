"""Pre-generation incident modifiers.

Some incidents change *quantities* that cascade into other facts (stock levels,
order volume) — those can't be patched onto the finished dataset after the
fact without breaking internal consistency (e.g. a stock movement's running
`on_hand_after`). Those incidents are compiled into lookup tables here and
consulted *while* `simulate/sales.py` and `simulate/inventory.py` generate,
so the cascading effects come out correct by construction.

The remaining incidents (price/cost/refund/payment perturbations) don't affect
quantities and are applied as a post-hoc pass in `apply.py` instead.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from .schema import Incident, IncidentType


@dataclass
class IncidentModifiers:
    """Compiled from the pre-generation-affecting incidents, keyed for fast lookup."""

    # supplier_id -> list of (window_start, window_end, extra_lead_days)
    supplier_extra_lead_days: dict[str, list[tuple[date, date, int]]] = field(default_factory=dict)
    # sku -> list of (window_start, window_end) during which demand is suppressed
    sku_demand_suppressed: dict[str, list[tuple[date, date]]] = field(default_factory=dict)
    # category -> list of (window_start, window_end, multiplier) overriding seasonal demand
    category_demand_override: dict[str, list[tuple[date, date, float]]] = field(default_factory=dict)
    # channel -> list of (window_start, window_end, multiplier) scaling order volume
    channel_volume_scale: dict[str, list[tuple[date, date, float]]] = field(default_factory=dict)

    def supplier_lead_extra(self, supplier_id: str, on: date) -> int:
        total = 0
        for start, end, extra in self.supplier_extra_lead_days.get(supplier_id, []):
            if start <= on <= end:
                total += extra
        return total

    def is_demand_suppressed(self, sku: str, on: date) -> bool:
        return any(start <= on <= end for start, end in self.sku_demand_suppressed.get(sku, []))

    def category_multiplier(self, category: str, on: date) -> float | None:
        for start, end, mult in self.category_demand_override.get(category, []):
            if start <= on <= end:
                return mult
        return None

    def channel_multiplier(self, channel: str, on: date) -> float:
        mult = 1.0
        for start, end, m in self.channel_volume_scale.get(channel, []):
            if start <= on <= end:
                mult *= m
        return mult


# Incident types whose effect is compiled into `IncidentModifiers` (must be applied
# *during* generation, not patched on afterwards).
PRE_GENERATION_TYPES = frozenset(
    {
        IncidentType.SUPPLIER_DELAY,
        IncidentType.DEAD_STOCK_BUILDUP,
        IncidentType.SEASONAL_SHIFT,
        IncidentType.CHANNEL_MIX_SHIFT,
    }
)


def build_modifiers(incidents: tuple[Incident, ...]) -> IncidentModifiers:
    mods = IncidentModifiers()
    for incident in incidents:
        window = (incident.window_start, incident.window_end)
        if incident.type is IncidentType.SUPPLIER_DELAY:
            for supplier_id in incident.affected_entities.get("supplier", []):
                mods.supplier_extra_lead_days.setdefault(supplier_id, []).append((*window, 7))
        elif incident.type is IncidentType.DEAD_STOCK_BUILDUP:
            for sku in incident.affected_entities.get("sku", []):
                mods.sku_demand_suppressed.setdefault(sku, []).append(window)
        elif incident.type is IncidentType.SEASONAL_SHIFT:
            for category in incident.affected_entities.get("category", []):
                mods.category_demand_override.setdefault(category, []).append((*window, 0.4))
        elif incident.type is IncidentType.CHANNEL_MIX_SHIFT:
            for channel in incident.affected_entities.get("channel", []):
                mods.channel_volume_scale.setdefault(channel, []).append((*window, 1.6))
    return mods

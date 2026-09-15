"""Incident schema — the shape every planted incident declares.

The planted incident library IS the eval ground truth. Write incidents BEFORE the
agents; they define what success means. See docs/incident-library.md.

STUB — fields are indicative; tighten as the metric layer and detectors firm up.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum


class Difficulty(str, Enum):
    OBVIOUS = "obvious"
    SUBTLE = "subtle"
    CROSS_DOMAIN_ONLY = "cross_domain_only"


class IncidentType(str, Enum):
    SUPPLIER_DELAY = "supplier_delay"
    PRICE_ERROR = "price_error"
    COGS_CREEP = "cogs_creep"
    RETURNS_SPIKE = "returns_spike"
    AR_AGEING_BLOWOUT = "ar_ageing_blowout"
    MARGIN_KILLING_DISCOUNT = "margin_killing_discount"
    SEASONAL_SHIFT = "seasonal_shift"
    CHANNEL_MIX_SHIFT = "channel_mix_shift"
    DEAD_STOCK_BUILDUP = "dead_stock_buildup"


@dataclass(frozen=True)
class ExpectedSignal:
    """A (metric, detector) pair the detectors should fire for this incident."""

    metric_id: str
    detector: str  # zscore_7d | wow_change | threshold


@dataclass(frozen=True)
class CausalStep:
    """One link in the causal chain the Correlator must recover."""

    domain: str  # sales | inventory | accounting
    claim: str
    metric_id: str


@dataclass(frozen=True)
class Incident:
    id: str
    type: IncidentType
    difficulty: Difficulty
    window_start: date
    window_end: date
    affected_entities: dict[str, list[str]]  # e.g. {"sku": [...], "supplier": [...]}
    expected_signals: list[ExpectedSignal] = field(default_factory=list)
    expected_causal_chain: list[CausalStep] = field(default_factory=list)
    true_dollar_impact: float = 0.0
    dollar_recoverable: float = 0.0
    is_hero: bool = False

    # TODO: from_yaml() / apply(dataset) — mutate the generated data to plant this incident.

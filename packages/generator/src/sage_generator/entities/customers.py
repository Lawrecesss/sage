"""Customer segments — the buyer mix the sales simulator draws each order from.

Sage models customers as a small fixed set of behavioural segments (this is all
``dim_customer_segment`` needs), not as individuals. The segment definitions and
their default mix live in `config.py` alongside the channel mix; `GeneratorConfig`
validates that `order_share` sums to 1.0. This module just exposes them for entity
assembly and gives the sales simulator a name -> segment lookup.

Incidents hook these baselines: `returns_spike` lifts `return_rate_multiplier` for
a segment, `margin_killing_discount` leans on `discount_affinity`, and
`ar_ageing_blowout` stretches payment on the `pays_on_credit` segment.
"""

from __future__ import annotations

from ..config import DEFAULT_SEGMENTS, CustomerSegment, GeneratorConfig

__all__ = ["DEFAULT_SEGMENTS", "CustomerSegment", "build_segments", "segments_by_name"]


def build_segments(config: GeneratorConfig) -> tuple[CustomerSegment, ...]:
    """The run's customer-segment mix (already validated by `GeneratorConfig`)."""
    return config.customer_segments


def segments_by_name(segments: tuple[CustomerSegment, ...]) -> dict[str, CustomerSegment]:
    """Index the mix by segment name."""
    return {s.name: s for s in segments}

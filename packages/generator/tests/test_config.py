"""GeneratorConfig: defaults reproduce a 12-month run; validation is strict."""

from datetime import date

import pytest
from pydantic import ValidationError
from sage_generator.config import DEFAULT_CONFIG, GeneratorConfig


def test_defaults_are_a_12_month_run() -> None:
    c = GeneratorConfig()
    assert c.seed == 42
    assert c.months == 12
    assert c.start_date == date(2025, 9, 1)
    assert c.end_date == date(2026, 8, 31)
    assert c.day_count == 365
    days = list(c.dates())
    assert (days[0], days[-1]) == (c.start_date, c.end_date)


def test_default_config_is_frozen_and_reproducible() -> None:
    assert GeneratorConfig().manifest() == DEFAULT_CONFIG.manifest()
    with pytest.raises(ValidationError):
        DEFAULT_CONFIG.seed = 1  # type: ignore[misc]


def test_channel_shares_must_sum_to_one() -> None:
    good = GeneratorConfig()
    assert sum(ch.revenue_share for ch in good.channels) == pytest.approx(1.0)
    with pytest.raises(ValidationError, match="sum to 1.0"):
        GeneratorConfig(
            channels=(
                {"name": "a", "revenue_share": 0.4, "avg_order_value_sgd": 50.0},
                {"name": "b", "revenue_share": 0.4, "avg_order_value_sgd": 50.0},
            ),
        )


def test_customer_segment_shares_must_sum_to_one() -> None:
    assert sum(s.order_share for s in GeneratorConfig().customer_segments) == pytest.approx(1.0)
    with pytest.raises(ValidationError, match="order_share must sum to 1.0"):
        GeneratorConfig(
            customer_segments=(
                {"name": "a", "label": "A", "order_share": 0.3},
                {"name": "b", "label": "B", "order_share": 0.3},
            ),
        )


def test_seasonal_event_must_reference_known_categories() -> None:
    with pytest.raises(ValidationError, match="unknown categories"):
        GeneratorConfig(
            seasonal_events=(
                {"name": "Bogus", "peak": "2026-01-01", "categories": ("Nonexistent",)},
            ),
        )


def test_for_run_overrides_flags_and_keeps_defaults() -> None:
    c = GeneratorConfig.for_run(months=3, seed=7)
    assert (c.seed, c.months) == (7, 3)
    assert c.end_date == date(2025, 11, 30)
    assert [e.name for e in c.events_in_window] == ["Singles' Day (11.11)"]
    assert c.sku_count == GeneratorConfig().sku_count

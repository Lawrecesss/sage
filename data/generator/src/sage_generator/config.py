"""Generator config: date range, seed, channel mix, categories, seasonality knobs.

`GeneratorConfig` is the single source of truth for one synthetic-dataset run.
Its defaults reproduce the committed 12-month "Lian & Co." demo dataset (seed 42);
`sage-generate generate` and `scripts/seed-demo.sh` build a config from CLI flags
on top of these defaults.

Everything here is deterministic: given the same `GeneratorConfig`, every
simulator and the incident library produce byte-identical output. The models are
frozen so a config cannot drift mid-run, and `manifest()` serialises the run
parameters into the dataset's `manifest.json`.
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from datetime import date, timedelta

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Persona: "Lian & Co." — a Singapore homeware retailer, ~1,200 SKUs.
CATEGORIES: tuple[str, ...] = (
    "Bedding & Linen",
    "Kitchen & Dining",
    "Tableware & Glassware",
    "Bath",
    "Lighting",
    "Storage & Organisation",
    "Home Decor",
    "Rugs & Soft Furnishing",
    "Candles & Fragrance",
    "Outdoor & Garden",
)

WEEKDAYS: tuple[str, ...] = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


class ChannelMix(BaseModel):
    """One sales channel and its baseline economics.

    `revenue_share` is that channel's fraction of gross revenue; the shares across
    all channels in a config must sum to 1.0.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    revenue_share: float = Field(gt=0, le=1)
    avg_order_value_sgd: float = Field(gt=0)
    baseline_discount_rate: float = Field(default=0.0, ge=0, le=1)
    return_rate: float = Field(default=0.0, ge=0, le=1)


class SeasonalEvent(BaseModel):
    """A demand event anchored on a calendar date.

    The event ramps up over `lead_days` before `peak` and decays over `tail_days`
    after it. `demand_multiplier` is the multiplier applied to baseline demand at
    the peak; `categories` scopes the event (``None`` means every category).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    peak: date
    lead_days: int = Field(default=0, ge=0)
    tail_days: int = Field(default=0, ge=0)
    demand_multiplier: float = Field(default=1.0, gt=0)
    discount_uplift: float = Field(default=0.0, ge=0, le=1)
    categories: tuple[str, ...] | None = None

    @property
    def start(self) -> date:
        return self.peak - timedelta(days=self.lead_days)

    @property
    def end(self) -> date:
        return self.peak + timedelta(days=self.tail_days)


class CustomerSegment(BaseModel):
    """One buyer segment — the mix the sales simulator draws each order from.

    `order_share` is that segment's fraction of all orders; the shares across a
    config must sum to 1.0. The multipliers apply on top of the channel baselines
    in `channels`. `pays_on_credit` routes an order into `fact_invoice` / AR ageing
    instead of settling at checkout.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str  # snake_case dim_customer_segment key
    label: str  # human name for the brief
    order_share: float = Field(gt=0, le=1)
    aov_multiplier: float = Field(default=1.0, gt=0)  # basket value vs channel AOV
    units_per_order_multiplier: float = Field(default=1.0, gt=0)  # qty per order vs baseline
    discount_affinity: float = Field(default=0.0, ge=0, le=1)  # skew to discounted buys
    return_rate_multiplier: float = Field(default=1.0, ge=0)  # returns vs channel baseline
    repeat_rate: float = Field(default=0.0, ge=0, le=1)  # chance this buyer orders again
    pays_on_credit: bool = False


DEFAULT_CHANNELS: tuple[ChannelMix, ...] = (
    ChannelMix(
        name="outlet",
        revenue_share=0.34,
        avg_order_value_sgd=78.0,
        baseline_discount_rate=0.05,
        return_rate=0.02,
    ),
    ChannelMix(
        name="shopify",
        revenue_share=0.30,
        avg_order_value_sgd=115.0,
        baseline_discount_rate=0.12,
        return_rate=0.06,
    ),
    ChannelMix(
        name="lazada",
        revenue_share=0.18,
        avg_order_value_sgd=62.0,
        baseline_discount_rate=0.20,
        return_rate=0.08,
    ),
    ChannelMix(
        name="shopee",
        revenue_share=0.18,
        avg_order_value_sgd=58.0,
        baseline_discount_rate=0.22,
        return_rate=0.09,
    ),
)

# Anchored to the default window (2025-09-01 .. 2026-08-31). A shorter run simply
# excludes the events that fall outside it — see `events_in_window`.
DEFAULT_SEASONAL_EVENTS: tuple[SeasonalEvent, ...] = (
    SeasonalEvent(
        name="Singles' Day (11.11)",
        peak=date(2025, 11, 11),
        lead_days=3,
        tail_days=1,
        demand_multiplier=2.4,
        discount_uplift=0.25,
    ),
    SeasonalEvent(
        name="Christmas",
        peak=date(2025, 12, 25),
        lead_days=24,
        tail_days=2,
        demand_multiplier=1.6,
        discount_uplift=0.10,
        categories=("Home Decor", "Candles & Fragrance", "Tableware & Glassware", "Lighting"),
    ),
    SeasonalEvent(
        name="Chinese New Year",
        peak=date(2026, 2, 17),
        lead_days=18,
        tail_days=5,
        demand_multiplier=1.8,
        discount_uplift=0.08,
        categories=(
            "Home Decor",
            "Kitchen & Dining",
            "Tableware & Glassware",
            "Bedding & Linen",
        ),
    ),
)

# The default "Lian & Co." buyer mix. `order_share` sums to 1.0.
DEFAULT_SEGMENTS: tuple[CustomerSegment, ...] = (
    CustomerSegment(
        name="walk_in",
        label="Walk-in shopper",
        order_share=0.30,
        aov_multiplier=0.75,
        units_per_order_multiplier=0.85,
        discount_affinity=0.15,
        return_rate_multiplier=0.4,
        repeat_rate=0.25,
    ),
    CustomerSegment(
        name="online_regular",
        label="Online regular",
        order_share=0.34,
        discount_affinity=0.35,
        repeat_rate=0.30,
    ),
    CustomerSegment(
        name="loyalty_member",
        label="Loyalty member",
        order_share=0.18,
        aov_multiplier=1.35,
        units_per_order_multiplier=1.25,
        discount_affinity=0.30,
        return_rate_multiplier=0.6,
        repeat_rate=0.72,
    ),
    CustomerSegment(
        name="deal_seeker",
        label="Deal seeker",
        order_share=0.13,
        aov_multiplier=0.70,
        units_per_order_multiplier=0.95,
        discount_affinity=0.90,
        return_rate_multiplier=1.8,
        repeat_rate=0.28,
    ),
    CustomerSegment(
        name="trade_wholesale",
        label="Trade / wholesale",
        order_share=0.05,
        aov_multiplier=3.2,
        units_per_order_multiplier=4.0,
        discount_affinity=0.10,
        return_rate_multiplier=0.15,
        repeat_rate=0.85,
        pays_on_credit=True,
    ),
)


class GeneratorConfig(BaseModel):
    """Parameters for one synthetic-dataset run. Defaults = the demo dataset."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    # --- reproducibility ---
    seed: int = Field(default=42, ge=0)
    start_date: date = date(2025, 9, 1)
    months: int = Field(default=12, ge=1, le=36)

    # --- business shape ("Lian & Co.") ---
    currency: str = "SGD"
    target_monthly_revenue_sgd: float = Field(default=180_000.0, gt=0)
    sku_count: int = Field(default=1_200, ge=1)
    supplier_count: int = Field(default=18, ge=1)
    categories: tuple[str, ...] = CATEGORIES

    # --- channel mix ---
    channels: tuple[ChannelMix, ...] = DEFAULT_CHANNELS

    # --- customer mix ---
    customer_segments: tuple[CustomerSegment, ...] = DEFAULT_SEGMENTS

    # --- unit economics ---
    target_gross_margin_pct: float = Field(default=0.52, gt=0, lt=1)
    price_jitter: float = Field(default=0.08, ge=0)  # ± spread around the margin-implied price

    # --- demand model ---
    monthly_growth_rate: float = Field(default=0.015)  # underlying month-over-month trend
    weekday_multipliers: tuple[float, float, float, float, float, float, float] = (
        0.90,  # Mon
        0.92,  # Tue
        0.96,  # Wed
        1.03,  # Thu
        1.18,  # Fri
        1.35,  # Sat
        1.06,  # Sun
    )
    daily_noise_cv: float = Field(default=0.12, ge=0)  # coefficient of variation on daily demand
    partial_refund_share: float = Field(
        default=0.35, ge=0, le=1
    )  # of returns that refund partially

    # --- seasonality ---
    seasonal_events: tuple[SeasonalEvent, ...] = DEFAULT_SEASONAL_EVENTS

    # ------------------------------------------------------------------ derived
    @property
    def end_date(self) -> date:
        """Inclusive last day of the run (``start_date`` + ``months``, minus a day)."""
        total = self.start_date.month - 1 + self.months
        year = self.start_date.year + total // 12
        month = total % 12 + 1
        return date(year, month, 1) - timedelta(days=1)

    @property
    def day_count(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def dates(self) -> Iterator[date]:
        """Every calendar day in the run, in order."""
        for offset in range(self.day_count):
            yield self.start_date + timedelta(days=offset)

    @property
    def events_in_window(self) -> tuple[SeasonalEvent, ...]:
        """Seasonal events whose active window overlaps the run."""
        return tuple(
            ev
            for ev in self.seasonal_events
            if ev.end >= self.start_date and ev.start <= self.end_date
        )

    # --------------------------------------------------------------- factories
    @classmethod
    def for_run(
        cls,
        *,
        months: int | None = None,
        seed: int | None = None,
        start_date: date | None = None,
        **overrides: object,
    ) -> GeneratorConfig:
        """Build a config from CLI-style flags, falling back to defaults."""
        data: dict[str, object] = {}
        if months is not None:
            data["months"] = months
        if seed is not None:
            data["seed"] = seed
        if start_date is not None:
            data["start_date"] = start_date
        data.update(overrides)
        return cls.model_validate(data)

    def manifest(self) -> dict[str, object]:
        """Run parameters for the dataset's ``manifest.json``."""
        return {
            "seed": self.seed,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "months": self.months,
            "day_count": self.day_count,
            "currency": self.currency,
            "sku_count": self.sku_count,
            "supplier_count": self.supplier_count,
            "categories": list(self.categories),
            "channels": [c.name for c in self.channels],
            "customer_segments": [s.name for s in self.customer_segments],
            "seasonal_events": [e.name for e in self.events_in_window],
        }

    # -------------------------------------------------------------- validation
    @field_validator("categories")
    @classmethod
    def _categories_non_empty_and_unique(cls, v: tuple[str, ...]) -> tuple[str, ...]:
        if not v:
            raise ValueError("categories must not be empty")
        if len(set(v)) != len(v):
            raise ValueError("category names must be unique")
        return v

    @field_validator("channels")
    @classmethod
    def _channel_shares_sum_to_one(cls, v: tuple[ChannelMix, ...]) -> tuple[ChannelMix, ...]:
        if not v:
            raise ValueError("at least one channel is required")
        if len({c.name for c in v}) != len(v):
            raise ValueError("channel names must be unique")
        total = sum(c.revenue_share for c in v)
        if not math.isclose(total, 1.0, abs_tol=0.01):
            raise ValueError(f"channel revenue_share must sum to 1.0 (got {total:.3f})")
        return v

    @field_validator("customer_segments")
    @classmethod
    def _segment_shares_sum_to_one(
        cls, v: tuple[CustomerSegment, ...]
    ) -> tuple[CustomerSegment, ...]:
        if not v:
            raise ValueError("at least one customer segment is required")
        if len({s.name for s in v}) != len(v):
            raise ValueError("customer segment names must be unique")
        total = sum(s.order_share for s in v)
        if not math.isclose(total, 1.0, abs_tol=0.01):
            raise ValueError(f"customer segment order_share must sum to 1.0 (got {total:.3f})")
        return v

    @model_validator(mode="after")
    def _seasonal_events_reference_known_categories(self) -> GeneratorConfig:
        known = set(self.categories)
        for ev in self.seasonal_events:
            if ev.categories and not set(ev.categories) <= known:
                unknown = sorted(set(ev.categories) - known)
                raise ValueError(
                    f"seasonal event {ev.name!r} references unknown categories: {unknown}"
                )
        return self


DEFAULT_CONFIG = GeneratorConfig()

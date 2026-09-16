"""CustomerSegment — one buyer segment the sales simulator draws each order from."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CustomerSegment(BaseModel):
    """One buyer segment.

    `order_share` is that segment's fraction of all orders; the shares across a
    run must sum to 1.0. `pays_on_credit` routes an order into `fact_invoice` / AR
    ageing instead of settling at checkout.
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

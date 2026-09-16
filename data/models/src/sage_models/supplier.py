"""Supplier — a vendor in the fixed roster the catalog links to."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Supplier(BaseModel):
    """One vendor."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str  # e.g. "SUP-03"
    name: str
    country: str  # ISO-3166 alpha-2
    categories: tuple[str, ...]  # catalog categories this supplier can source
    lead_time_days: int = Field(gt=0)  # baseline PO -> receipt
    lead_time_std_days: float = Field(ge=0)  # day-to-day variability
    on_time_rate: float = Field(gt=0, le=1)  # share of POs that arrive on schedule
    payment_terms_days: int = Field(gt=0)  # net terms on their bills

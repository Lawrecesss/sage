"""Sku — one stock-keeping unit in the product catalog."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Sku(BaseModel):
    """One stock-keeping unit."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    sku: str  # e.g. "KIT-0042"
    name: str
    category: str
    subcategory: str
    supplier_id: str
    unit_cost_sgd: float = Field(gt=0)
    list_price_sgd: float = Field(gt=0)
    demand_weight: float = Field(gt=0)  # relative popularity (long-tail)
    abc_class: str  # "A" | "B" | "C" by demand_weight

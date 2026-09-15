"""Product catalog — ~1,200 SKUs, the fixed inventory the simulators move.

`build_catalog(config, suppliers)` returns a deterministic `tuple[Sku, ...]` of
length `config.sku_count`. Each SKU carries its category / subcategory, a wholesale
`unit_cost_sgd` drawn from a per-category band, a `list_price_sgd` implied by
`config.target_gross_margin_pct` (± `config.price_jitter`), a `supplier_id` linking
to a supplier that sources the category, and a long-tail `demand_weight` /
`abc_class` the sales simulator uses to shape volume.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field

from ..config import GeneratorConfig
from ..rng import substream
from .suppliers import Supplier, suppliers_by_category

# Short code per category, used to build human-readable SKU ids (LIN-, KIT-, ...).
_CATEGORY_CODE: dict[str, str] = {
    "Bedding & Linen": "LIN",
    "Kitchen & Dining": "KIT",
    "Tableware & Glassware": "TBL",
    "Bath": "BTH",
    "Lighting": "LGT",
    "Storage & Organisation": "STO",
    "Home Decor": "DEC",
    "Rugs & Soft Furnishing": "RUG",
    "Candles & Fragrance": "CND",
    "Outdoor & Garden": "OUT",
}

# Relative catalog size per category — SKUs are allotted by these weights, so the
# assortment is lumpy (lots of kitchen, few rugs) rather than a flat 120 each.
_ASSORTMENT_WEIGHT: dict[str, float] = {
    "Bedding & Linen": 1.15,
    "Kitchen & Dining": 1.60,
    "Tableware & Glassware": 1.25,
    "Bath": 1.00,
    "Lighting": 0.70,
    "Storage & Organisation": 1.10,
    "Home Decor": 1.30,
    "Rugs & Soft Furnishing": 0.45,
    "Candles & Fragrance": 0.85,
    "Outdoor & Garden": 0.60,
}

# Wholesale unit-cost band per category, SGD (min, max) — sampled log-uniform.
_COST_BAND_SGD: dict[str, tuple[float, float]] = {
    "Bedding & Linen": (12.0, 70.0),
    "Kitchen & Dining": (4.0, 45.0),
    "Tableware & Glassware": (3.0, 30.0),
    "Bath": (3.0, 28.0),
    "Lighting": (8.0, 90.0),
    "Storage & Organisation": (5.0, 40.0),
    "Home Decor": (4.0, 60.0),
    "Rugs & Soft Furnishing": (20.0, 180.0),
    "Candles & Fragrance": (2.0, 18.0),
    "Outdoor & Garden": (10.0, 120.0),
}

_SUBCATEGORIES: dict[str, tuple[str, ...]] = {
    "Bedding & Linen": ("Duvet Covers", "Bed Sheets", "Pillowcases", "Quilts", "Blankets"),
    "Kitchen & Dining": ("Cookware", "Bakeware", "Utensils", "Food Storage", "Cutting Boards"),
    "Tableware & Glassware": ("Dinnerware", "Drinkware", "Serveware", "Flatware", "Mugs"),
    "Bath": ("Towels", "Bath Mats", "Shower Curtains", "Bathroom Accessories"),
    "Lighting": ("Table Lamps", "Floor Lamps", "Pendant Lights", "String Lights"),
    "Storage & Organisation": (
        "Baskets",
        "Storage Boxes",
        "Shelving",
        "Drawer Organisers",
        "Hooks & Racks",
    ),
    "Home Decor": ("Vases", "Wall Art", "Cushions", "Photo Frames", "Decorative Objects"),
    "Rugs & Soft Furnishing": ("Area Rugs", "Runners", "Doormats", "Throws"),
    "Candles & Fragrance": ("Scented Candles", "Diffusers", "Tealights", "Room Sprays"),
    "Outdoor & Garden": ("Planters", "Outdoor Cushions", "Garden Tools", "Lanterns"),
}

# Material / finish adjectives per category, for readable product names.
_MATERIALS: dict[str, tuple[str, ...]] = {
    "Bedding & Linen": ("Linen", "Cotton", "Percale", "Sateen", "Flannel", "Bamboo"),
    "Kitchen & Dining": ("Stainless Steel", "Cast Iron", "Acacia", "Silicone", "Ceramic"),
    "Tableware & Glassware": ("Stoneware", "Porcelain", "Hand-Blown Glass", "Bamboo", "Enamel"),
    "Bath": ("Turkish Cotton", "Waffle", "Bamboo", "Egyptian Cotton", "Linen"),
    "Lighting": ("Rattan", "Brass", "Ceramic", "Linen-Shade", "Frosted Glass"),
    "Storage & Organisation": ("Seagrass", "Felt", "Acacia", "Powder-Coated", "Canvas"),
    "Home Decor": ("Stoneware", "Terracotta", "Marble", "Brass", "Handwoven"),
    "Rugs & Soft Furnishing": ("Wool", "Jute", "Cotton Flatweave", "Shag", "Kilim"),
    "Candles & Fragrance": ("Soy Wax", "Beeswax", "Reed", "Coconut Wax", "Ceramic-Jar"),
    "Outdoor & Garden": ("Terracotta", "Fibreclay", "Teak", "Galvanised", "Powder-Coated"),
}

_COLOURS: tuple[str, ...] = (
    "Natural",
    "Charcoal",
    "Ivory",
    "Sage",
    "Terracotta",
    "Navy",
    "Blush",
    "Stone",
)


class Sku(BaseModel):
    """One stock-keeping unit. Frozen — the catalog cannot drift mid-run."""

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


def _allot_counts(config: GeneratorConfig) -> dict[str, int]:
    """Split ``config.sku_count`` across categories by assortment weight (largest remainder)."""
    cats = list(config.categories)
    weights = [_ASSORTMENT_WEIGHT.get(c, 1.0) for c in cats]
    total_w = sum(weights)
    exact = [config.sku_count * w / total_w for w in weights]
    counts = [math.floor(x) for x in exact]
    remainder = config.sku_count - sum(counts)
    # hand the leftover SKUs to the categories with the largest fractional parts
    order = sorted(range(len(cats)), key=lambda i: exact[i] - counts[i], reverse=True)
    for i in order[:remainder]:
        counts[i] += 1
    return dict(zip(cats, counts, strict=True))


def _log_uniform(rng: random.Random, lo: float, hi: float) -> float:
    return math.exp(rng.uniform(math.log(lo), math.log(hi)))


def _psych_price(value: float) -> float:
    """Round up to the nearest whole dollar, then shave a cent → 39.90, 129.90, ..."""
    return max(1.0, math.ceil(value) - 0.10)


@dataclass
class _Draft:
    sku: str
    name: str
    category: str
    subcategory: str
    supplier_id: str
    unit_cost_sgd: float
    list_price_sgd: float
    demand_weight: float


def build_catalog(config: GeneratorConfig, suppliers: tuple[Supplier, ...]) -> tuple[Sku, ...]:
    """Deterministic catalog of length ``config.sku_count``, linked to ``suppliers``."""
    by_cat = suppliers_by_category(suppliers)
    margin = config.target_gross_margin_pct
    counts = _allot_counts(config)

    drafts: list[_Draft] = []
    running = 0
    for category in config.categories:
        sources = by_cat.get(category, ())
        if not sources:
            raise ValueError(f"no supplier sources category {category!r}")
        code = _CATEGORY_CODE.get(category, category[:3].upper())
        subcats = _SUBCATEGORIES[category]
        materials = _MATERIALS[category]
        cost_lo, cost_hi = _COST_BAND_SGD[category]

        rng = substream(config.seed, "catalog", category)
        for _ in range(counts[category]):
            running += 1
            subcat = rng.choice(subcats)
            material = rng.choice(materials)
            noun = subcat.removesuffix("s")
            name = f"{material} {noun}"
            if rng.random() < 0.45:
                name = f"{rng.choice(_COLOURS)} {name}"

            cost = round(_log_uniform(rng, cost_lo, cost_hi), 2)
            jitter = 1.0 + rng.uniform(-config.price_jitter, config.price_jitter)
            price = _psych_price(cost / (1.0 - margin) * jitter)
            if price <= cost:  # keep a positive margin even after adverse jitter
                price = _psych_price(cost / (1.0 - margin))

            drafts.append(
                _Draft(
                    sku=f"{code}-{running:04d}",
                    name=name,
                    category=category,
                    subcategory=subcat,
                    supplier_id=rng.choice(sources).id,
                    unit_cost_sgd=cost,
                    list_price_sgd=price,
                    demand_weight=round(rng.lognormvariate(0.0, 0.85), 4),
                )
            )

    # ABC class from the global demand-weight distribution: top 20% A, next 30% B.
    ranked = sorted(range(len(drafts)), key=lambda i: drafts[i].demand_weight, reverse=True)
    a_cut, b_cut = int(len(ranked) * 0.20), int(len(ranked) * 0.50)
    abc: dict[int, str] = {}
    for rank, idx in enumerate(ranked):
        abc[idx] = "A" if rank < a_cut else "B" if rank < b_cut else "C"

    return tuple(
        Sku(
            sku=d.sku,
            name=d.name,
            category=d.category,
            subcategory=d.subcategory,
            supplier_id=d.supplier_id,
            unit_cost_sgd=d.unit_cost_sgd,
            list_price_sgd=d.list_price_sgd,
            demand_weight=d.demand_weight,
            abc_class=abc[i],
        )
        for i, d in enumerate(drafts)
    )

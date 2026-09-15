"""Suppliers + baseline lead times — the fixed vendor roster the catalog links to.

`build_suppliers(config)` returns a deterministic `tuple[Supplier, ...]` of length
`config.supplier_count`. Each supplier has a home country (which drives its baseline
lead time), a reliability, payment terms for the accounting simulator, and the set
of catalog categories it can supply — collectively guaranteeing every category has
at least one source. `supplier_delay` incidents plant slippage on top of the
`lead_time_days` / `on_time_rate` baselines here.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ..config import CATEGORIES, GeneratorConfig
from ..rng import substream

# --- vendor roster -----------------------------------------------------------
# A curated pool of plausible regional homeware vendors: (name, country, specialty).
# The specialty is a category the supplier always sources (so "Lian Textile Mills"
# really does supply linen); breadth is added on top. `build_suppliers` takes the
# first `config.supplier_count` entries, so the roster is stable as the count grows
# and only the tail changes.
_ROSTER: tuple[tuple[str, str, str], ...] = (
    ("Lian Textile Mills", "SG", "Bedding & Linen"),
    ("Prosper Homeware Trading", "SG", "Storage & Organisation"),
    ("Selangor Glassworks", "MY", "Tableware & Glassware"),
    ("Penang Enamel Co.", "MY", "Kitchen & Dining"),
    ("Golden Lotus Ceramics", "CN", "Tableware & Glassware"),
    ("Foshan Bright Lighting", "CN", "Lighting"),
    ("Hangzhou Silk Route Textiles", "CN", "Bedding & Linen"),
    ("Dongguan Storage Solutions", "CN", "Storage & Organisation"),
    ("Ningbo Bath & Body", "CN", "Bath"),
    ("Qingdao Outdoor Living", "CN", "Outdoor & Garden"),
    ("Bến Thành Rattan Works", "VN", "Home Decor"),
    ("Saigon Linen House", "VN", "Bedding & Linen"),
    ("Ho Chi Minh Kitchenware", "VN", "Kitchen & Dining"),
    ("Bandung Craft Collective", "ID", "Home Decor"),
    ("Jepara Wood Studio", "ID", "Home Decor"),
    ("Surabaya Garden Co.", "ID", "Outdoor & Garden"),
    ("Bangkok Bloom Candles", "TH", "Candles & Fragrance"),
    ("Chiang Mai Clay Studio", "TH", "Tableware & Glassware"),
    ("Jaipur Block Print House", "IN", "Bedding & Linen"),
    ("Panipat Rug Mills", "IN", "Rugs & Soft Furnishing"),
    ("Moradabad Metal Arts", "IN", "Home Decor"),
    ("Guimarães Linen Atelier", "PT", "Bedding & Linen"),
    ("Porto Tableware Lda.", "PT", "Tableware & Glassware"),
    ("Bursa Towel Mills", "TR", "Bath"),
    ("Anatolia Weavers", "TR", "Rugs & Soft Furnishing"),
    ("Colombo Coir & Fibre", "LK", "Rugs & Soft Furnishing"),
)

# Baseline ocean/air lead-time band per origin, in days (min, max).
_LEAD_TIME_DAYS: dict[str, tuple[int, int]] = {
    "SG": (4, 9),
    "MY": (8, 15),
    "ID": (14, 24),
    "VN": (16, 26),
    "TH": (16, 26),
    "CN": (20, 34),
    "LK": (28, 42),
    "IN": (30, 46),
    "TR": (32, 48),
    "PT": (34, 50),
}

_DOMESTIC = {"SG", "MY"}
_PAYMENT_TERMS_DAYS: tuple[int, ...] = (14, 30, 30, 45, 60)


class Supplier(BaseModel):
    """One vendor. Frozen — the roster cannot drift mid-run."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str  # e.g. "SUP-03"
    name: str
    country: str  # ISO-3166 alpha-2
    categories: tuple[str, ...]  # catalog categories this supplier can source
    lead_time_days: int = Field(gt=0)  # baseline PO -> receipt
    lead_time_std_days: float = Field(ge=0)  # day-to-day variability
    on_time_rate: float = Field(gt=0, le=1)  # share of POs that arrive on schedule
    payment_terms_days: int = Field(gt=0)  # net terms on their bills


def build_suppliers(config: GeneratorConfig) -> tuple[Supplier, ...]:
    """Deterministic vendor roster of length ``config.supplier_count``."""
    n = config.supplier_count
    if n > len(_ROSTER):
        raise ValueError(f"supplier_count={n} exceeds the roster ({len(_ROSTER)}); extend _ROSTER")
    rng = substream(config.seed, "suppliers")
    categories = list(config.categories)
    known = set(categories)

    # Start each supplier from its specialty (skip any not in this run's category set).
    cats_per_supplier: list[list[str]] = [
        [_ROSTER[idx][2]] if _ROSTER[idx][2] in known else [] for idx in range(n)
    ]

    # Coverage: any category no specialty covers gets handed out round-robin, so
    # nothing is left unsourced even when supplier_count < category_count.
    uncovered = [c for c in categories if c not in {s for row in cats_per_supplier for s in row}]
    rng.shuffle(uncovered)
    for i, cat in enumerate(uncovered):
        cats_per_supplier[i % n].append(cat)

    # Breadth: give each supplier one or two extra categories.
    for owned in cats_per_supplier:
        for _ in range(rng.randint(1, 2)):
            cat = rng.choice(categories)
            if cat not in owned:
                owned.append(cat)

    suppliers: list[Supplier] = []
    for idx in range(n):
        name, country, _specialty = _ROSTER[idx]
        lo, hi = _LEAD_TIME_DAYS[country]
        lead = rng.randint(lo, hi)
        domestic = country in _DOMESTIC
        on_time = round(rng.uniform(0.90, 0.98) if domestic else rng.uniform(0.78, 0.95), 3)
        terms = 14 if domestic and rng.random() < 0.5 else rng.choice(_PAYMENT_TERMS_DAYS)
        suppliers.append(
            Supplier(
                id=f"SUP-{idx + 1:02d}",
                name=name,
                country=country,
                categories=tuple(sorted(set(cats_per_supplier[idx]))),
                lead_time_days=lead,
                lead_time_std_days=round(lead * rng.uniform(0.12, 0.30), 2),
                on_time_rate=on_time,
                payment_terms_days=terms,
            )
        )
    return tuple(suppliers)


def suppliers_by_category(suppliers: tuple[Supplier, ...]) -> dict[str, tuple[Supplier, ...]]:
    """Index the roster by the categories each supplier can source."""
    index: dict[str, list[Supplier]] = {cat: [] for cat in CATEGORIES}
    for sup in suppliers:
        for cat in sup.categories:
            index.setdefault(cat, []).append(sup)
    return {cat: tuple(sups) for cat, sups in index.items()}

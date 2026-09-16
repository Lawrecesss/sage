"""The generated cast for one run — suppliers, catalog, and customer segments."""

from __future__ import annotations

from dataclasses import dataclass

from sage_models import CustomerSegment, Sku, Supplier

from .catalog import build_catalog
from .config import GeneratorConfig
from .customers import build_segments
from .suppliers import build_suppliers

__all__ = ["Entities", "build_entities"]


@dataclass(frozen=True)
class Entities:
    """The generated cast for one run: suppliers, catalog, and customer segments."""

    suppliers: tuple[Supplier, ...]
    catalog: tuple[Sku, ...]
    segments: tuple[CustomerSegment, ...]

    @property
    def supplier_by_id(self) -> dict[str, Supplier]:
        return {s.id: s for s in self.suppliers}

    @property
    def sku_by_id(self) -> dict[str, Sku]:
        return {s.sku: s for s in self.catalog}

    @property
    def segment_by_name(self) -> dict[str, CustomerSegment]:
        return {s.name: s for s in self.segments}


def build_entities(config: GeneratorConfig) -> Entities:
    """Build the full entity cast for a run, in dependency order."""
    suppliers = build_suppliers(config)
    return Entities(
        suppliers=suppliers,
        catalog=build_catalog(config, suppliers),
        segments=build_segments(config),
    )

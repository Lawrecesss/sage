"""Entity models — the fixed cast the simulators draw from."""

from __future__ import annotations

from dataclasses import dataclass

from ..config import CustomerSegment, GeneratorConfig
from .catalog import Sku, build_catalog
from .customers import build_segments, segments_by_name
from .suppliers import Supplier, build_suppliers, suppliers_by_category

__all__ = [
    "CustomerSegment",
    "Entities",
    "Sku",
    "Supplier",
    "build_catalog",
    "build_entities",
    "build_segments",
    "build_suppliers",
    "segments_by_name",
    "suppliers_by_category",
]


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

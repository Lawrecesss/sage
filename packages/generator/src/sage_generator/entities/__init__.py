"""Entity models — the fixed cast the simulators draw from."""

from __future__ import annotations

from dataclasses import dataclass

from ..config import GeneratorConfig
from .catalog import Sku, build_catalog
from .suppliers import Supplier, build_suppliers, suppliers_by_category

__all__ = [
    "Entities",
    "Sku",
    "Supplier",
    "build_catalog",
    "build_entities",
    "build_suppliers",
    "suppliers_by_category",
]


@dataclass(frozen=True)
class Entities:
    """The generated cast for one run: suppliers + the catalog linked to them."""

    suppliers: tuple[Supplier, ...]
    catalog: tuple[Sku, ...]

    @property
    def supplier_by_id(self) -> dict[str, Supplier]:
        return {s.id: s for s in self.suppliers}

    @property
    def sku_by_id(self) -> dict[str, Sku]:
        return {s.sku: s for s in self.catalog}


def build_entities(config: GeneratorConfig) -> Entities:
    """Build the full entity cast for a run, in dependency order."""
    suppliers = build_suppliers(config)
    return Entities(suppliers=suppliers, catalog=build_catalog(config, suppliers))

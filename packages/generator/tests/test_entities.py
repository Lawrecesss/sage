"""Entities: deterministic from the seed, internally consistent, every category sourced."""

from __future__ import annotations

import pytest
from sage_generator.config import GeneratorConfig
from sage_generator.entities import build_catalog, build_entities, build_suppliers

CFG = GeneratorConfig()


def test_supplier_roster_shape() -> None:
    suppliers = build_suppliers(CFG)
    assert len(suppliers) == CFG.supplier_count
    assert [s.id for s in suppliers] == [f"SUP-{i:02d}" for i in range(1, CFG.supplier_count + 1)]
    assert len({s.name for s in suppliers}) == CFG.supplier_count
    for s in suppliers:
        assert s.lead_time_days > 0
        assert 0 < s.on_time_rate <= 1
        assert s.categories  # every supplier sources at least one category


def test_every_category_has_a_source() -> None:
    covered = {c for s in build_suppliers(CFG) for c in s.categories}
    assert covered == set(CFG.categories)


def test_catalog_shape_and_referential_integrity() -> None:
    e = build_entities(CFG)
    assert len(e.catalog) == CFG.sku_count
    assert len({k.sku for k in e.catalog}) == CFG.sku_count
    for k in e.catalog:
        supplier = e.supplier_by_id[k.supplier_id]  # KeyError => dangling link
        assert k.category in supplier.categories
        assert k.category in CFG.categories
        assert k.subcategory
        assert k.list_price_sgd > k.unit_cost_sgd
        assert k.abc_class in {"A", "B", "C"}


def test_catalog_spans_every_category() -> None:
    e = build_entities(CFG)
    assert {k.category for k in e.catalog} == set(CFG.categories)


def test_gross_margin_lands_near_target() -> None:
    e = build_entities(CFG)
    margins = [(k.list_price_sgd - k.unit_cost_sgd) / k.list_price_sgd for k in e.catalog]
    mean_margin = sum(margins) / len(margins)
    assert CFG.target_gross_margin_pct - 0.05 < mean_margin < CFG.target_gross_margin_pct + 0.05


def test_abc_split_is_roughly_20_30_50() -> None:
    catalog = build_entities(CFG).catalog
    share = {c: sum(k.abc_class == c for k in catalog) / len(catalog) for c in "ABC"}
    assert share["A"] == pytest.approx(0.20, abs=0.02)
    assert share["B"] == pytest.approx(0.30, abs=0.02)
    assert share["C"] == pytest.approx(0.50, abs=0.02)


def test_deterministic_from_seed() -> None:
    a, b = build_entities(CFG), build_entities(GeneratorConfig())
    assert a.suppliers == b.suppliers
    assert a.catalog == b.catalog


def test_seed_changes_the_data() -> None:
    other = build_entities(GeneratorConfig(seed=7))
    base = build_entities(CFG)
    assert other.catalog != base.catalog
    assert other.suppliers != base.suppliers


def test_smaller_run_still_consistent() -> None:
    cfg = GeneratorConfig(sku_count=200, supplier_count=8)
    e = build_entities(cfg)
    assert len(e.catalog) == 200
    assert len(e.suppliers) == 8
    assert {c for s in e.suppliers for c in s.categories} == set(cfg.categories)
    assert all(k.supplier_id in e.supplier_by_id for k in e.catalog)


def test_supplier_count_over_roster_is_rejected() -> None:
    with pytest.raises(ValueError, match="exceeds the roster"):
        build_suppliers(GeneratorConfig(supplier_count=99))


def test_catalog_needs_a_source_for_every_category() -> None:
    # one supplier that only covers a single category leaves the rest unsourced
    lonely = build_suppliers(CFG)[0].model_copy(update={"categories": (CFG.categories[0],)})
    with pytest.raises(ValueError, match="no supplier sources category"):
        build_catalog(CFG, (lonely,))

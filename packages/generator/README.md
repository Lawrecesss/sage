# packages/generator

Synthetic SME dataset + planted incident library. Owned by M1. Produces 12 months of *correlated* Sales/Inventory/Accounting data with ~20 planted incidents (the eval ground truth). See docs/incident-library.md.

> WIP. Done: `config.py` (run parameters), `rng.py` (deterministic sub-streams),
> `entities/` (`build_suppliers`, `build_catalog`, `build_entities`).
> Next: simulators (`sales` / `inventory` / `accounting`), the CLI, the incident library.

## Entities

`build_entities(config)` returns the fixed cast for a run — a `tuple[Supplier, ...]`
(roster with per-country lead times, reliability, payment terms, sourced categories)
and a `tuple[Sku, ...]` (~1,200 SKUs: category/subcategory, cost, margin-implied
list price, supplier link, long-tail `demand_weight` and `abc_class`). Everything is
deterministic from `config.seed`.

# packages/generator

Synthetic SME dataset + planted incident library. Owned by M1. Produces 12 months of *correlated* Sales/Inventory/Accounting data with ~20 planted incidents (the eval ground truth). See docs/incident-library.md.

> WIP. Done: `config.py` (run parameters + channel/customer mix), `rng.py`
> (deterministic sub-streams), `entities/` (`build_suppliers`, `build_catalog`,
> `build_segments`, `build_entities`).
> Next: simulators (`sales` / `inventory` / `accounting`), the CLI, the incident library.

## Entities

`build_entities(config)` returns the fixed cast for a run, all deterministic from
`config.seed`:

- **suppliers** — `tuple[Supplier, ...]`: roster with a specialty category,
  per-country lead time / reliability, payment terms, and the categories it sources.
- **catalog** — `tuple[Sku, ...]` (~1,200): category/subcategory, wholesale cost,
  margin-implied list price, supplier link, long-tail `demand_weight` + `abc_class`.
- **segments** — `tuple[CustomerSegment, ...]`: the buyer mix (defined in `config.py`),
  each with basket / discount / return / repeat multipliers and `pays_on_credit`.

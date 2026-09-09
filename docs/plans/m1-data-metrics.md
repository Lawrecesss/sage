# M1 — Data & Metrics Engineer

## Lane summary

- **Owns:** synthetic generator, incident library, warehouse schema, metric layer, detectors.
- **Backs up:** M4 on infrastructure.
- **Success test:** every planted incident is visible as a metric deviation, and the
  data passes a "does this look real?" eyeball from someone outside the team.
- **You are the least blocked lane — start today.** M2 and the eval harness both
  wait on your output.

## Skills this lane wants

SQL, Polars (the generator + transforms use it), a bit of time-series stats
(rolling z-score, week-over-week, seasonality). No LLM work.

## Where your code goes

| Area | Path |
| --- | --- |
| Generator | `packages/generator/src/sage_generator/` |
| Incident library | `packages/generator/src/sage_generator/incidents/` |
| Warehouse schema + transforms | `packages/warehouse/src/sage_warehouse/models/` |
| Metric layer | `packages/warehouse/src/sage_warehouse/metrics/` |
| Detectors | `packages/detectors/src/sage_detectors/` |

Run your tests with `uv run pytest packages/generator packages/warehouse packages/detectors`.

---

## Sprint 1 · Sep 8–14 — a plausible 3-source dataset, locally

- [ ] **Generator config** — `packages/generator/src/sage_generator/config.py`
      *Done when:* a `GeneratorConfig` (Pydantic) carries date range, seed, channel
      mix, category list and seasonality knobs; defaults reproduce a 12-month run.

- [ ] **Entity models** — `entities/catalog.py`, `entities/suppliers.py`, `entities/customers.py`
      *Done when:* `catalog.py` builds ~1,200 SKUs (category, subcategory, unit cost,
      list price, supplier link); `suppliers.py` gives each supplier a baseline lead
      time; `customers.py` gives a segment mix. Deterministic from the seed.

- [ ] **Simulator base + three sources** — `simulators/base.py`, `simulators/sales.py`,
      `simulators/inventory.py`, `simulators/accounting.py`
      *Done when:* `base.py` defines the `Simulator` ABC (`emit(day) -> list[payload]`);
      the three emit Shopify- / WMS- / Xero-shaped payloads for 12 months, and the
      data is **correlated** — an order in sales moves stock in inventory and COGS in
      accounting for the same SKU and day.

- [ ] **Generator CLI** — `packages/generator/src/sage_generator/cli.py`
      *Done when:* `uv run sage-generate generate --months 12 --seed 42 --out ./data`
      writes Parquet per source plus a `manifest.json`. This is what
      `scripts/seed-demo.sh` calls.

- [ ] **Warehouse DDL** — `packages/warehouse/src/sage_warehouse/models/schema.sql`
      *Done when:* real `CREATE TABLE` statements for the dims (`dim_date`, `dim_sku`,
      `dim_channel`, `dim_supplier`, `dim_customer_segment`), the facts
      (`fact_order_line`, `fact_stock_movement`, `fact_purchase_order`,
      `fact_invoice`, `fact_bill`) and the agent-facing tables (`signals`,
      `briefings`, `causal_chains`). Currently a comment sketch — turn it into DDL.

- [ ] **DB bootstrap** — `packages/warehouse/src/sage_warehouse/db.py`, `cli.py`
      *Done when:* `db.py` exposes an engine/session factory reading
      `Settings.database_url`; `uv run sage-warehouse init-db` applies `schema.sql`
      (and `CREATE EXTENSION vector`) against local Postgres from `docker-compose.yml`.

- [ ] **Loader** — `packages/warehouse/src/sage_warehouse/loader.py`,
      `models/run_transforms.py`
      *Done when:* `uv run sage-warehouse load ./data` loads raw Parquet → staging →
      the star schema; `run_transforms.py` executes the ordered `.sql` files in
      `models/transforms/`.

- [ ] **Incident schema + library skeleton** — `incidents/schema.py`, `incidents/library.py`
      *Done when:* `schema.py` finalises the `Incident` dataclass (type, difficulty,
      affected entities, window, expected signals, expected causal chain, true dollar
      impact, `is_hero`) with a `from_yaml`; `library.py` loads every YAML in
      `incidents/planted/` and can `apply(dataset)` to mutate the generated data.

- [ ] **First ~5 planted incidents** — `incidents/planted/*.yaml`
      *Done when:* 5 incidents exist (mix of obvious + subtle), each reproducible,
      including a first draft of the **hero** cross-domain incident (supplier delay →
      stockout → revenue + margin). Schema per [`../incident-library.md`](../incident-library.md).

- [ ] **🔒 Freeze the tool JSON schemas with M2** — [`../contracts/tool-schemas.md`](../contracts/tool-schemas.md)
      *Done when:* `query_metric`, `list_metrics`, `get_signals`, `compare_period`
      and `trace_lineage` I/O shapes are agreed, the doc says "FROZEN", and it's
      committed. **Deadline Sep 14.** *Blocks:* all of M2.

**S1 gate:** `./scripts/seed-demo.sh` runs generate → init-db → load without error;
`uv run pytest packages/warehouse` is green.

---

## Sprint 2 · Sep 15–21 — the metric layer and real detectors

- [ ] **Metric catalog to ~20–25 metrics** — `packages/warehouse/src/sage_warehouse/metrics/metrics.yaml`
      *Done when:* every metric listed in [`../metrics-catalog.md`](../metrics-catalog.md)
      (sales / inventory / accounting) exists with `sql`, `grain`, `dimensions`,
      `unit`, `direction`, `detectors`, `owner_domain` (and `thresholds` where the
      threshold detector applies). *Blocks:* M2 Sprint 2.

- [ ] **Metric loader + validation** — `metrics/loader.py`
      *Done when:* `list_metrics()` / `get_metric(id)` parse and **validate**
      `metrics.yaml` (fail loudly on a bad grain, unknown dimension, missing
      threshold); backs the `list_metrics` agent tool.

- [ ] **`query_metric` execution** — `metrics/query.py`
      *Done when:* `query_metric(metric_id, period, grain, dimensions)` runs the
      metric SQL against the star schema, buckets by grain, binds `period` and
      `dimensions` safely, and returns typed rows. No raw SQL escapes this function.

- [ ] **`trace_lineage`** — `metrics/query.py` (or a sibling module)
      *Done when:* `trace_lineage(metric_id)` returns the SQL + source tables +
      owner domain. This is the governance story judges ask about.

- [ ] **Detector base + three types** — `detectors/base.py`, `detectors/zscore.py`,
      `detectors/wow_change.py`, `detectors/threshold.py`
      *Done when:* `base.py` defines the `Detector` ABC (`detect(metric, series) ->
      list[Signal]`); the three implement rolling 7-day z-score, week-over-week %
      change, and threshold breach (bounds from `metrics.yaml`).

- [ ] **Dollar-impact estimation** — `detectors/impact.py`
      *Done when:* each signal gets a `dollar_impact_est` from observed-vs-expected ×
      the metric's unit economics.

- [ ] **Detector runner** — `detectors/runner.py`, `detectors/cli.py`
      *Done when:* `uv run sage-detectors run` iterates every metric × its declared
      detectors over the warehouse and writes rows to the `signals` table.

- [ ] **Remaining ~15 incidents** — `incidents/planted/*.yaml`
      *Done when:* ~20 total across 12 months, including **4–5 cross-domain-only**
      (invisible from any single source). Types per [`../incident-library.md`](../incident-library.md).

- [ ] **Golden-file metric tests** — `packages/warehouse/tests/`
      *Done when:* each metric queried at day/week/month grain against a fixed
      dataset produces known values; drift fails CI.

**S2 gate (shared, Sep 21):** a real anomaly from your `signals` table is picked up
by M2's Watcher and shown by M3 in a browser. Your part: real signals exist for all
3 domains.

---

## Sprint 3 · Sep 22–28 — realism, ranking, freeze

- [ ] **Realism tuning** — `simulators/*.py`, `config.py`
      *Done when:* the data has seasonality (CNY, 11.11, Christmas), weekday effects,
      noise, returns and partial refunds; a teammate outside M1 can't tell it's fake.

- [ ] **Signal scoring & ranking** — `detectors/runner.py` (or `detectors/impact.py`)
      *Done when:* signals get a combined score (`score × |dollar_impact|`) so a
      brief can be trimmed to **≤5 items**. Feeds M2's Briefing agent.

- [ ] **🔒 Freeze the demo dataset** — versioned snapshot under `./data/snapshots/`
      *Done when:* one command reproduces the exact demo dataset, it's tagged
      (`demo-v1`), and `SAGE_DATASET_SNAPSHOT` in `.env.example` points at it.
      Everything downstream now runs against this. *Deterministic, live-demo-safe.*

- [ ] **Hand eval ground-truth to M2** — frozen `incidents/planted/` + dataset snapshot
      *Done when:* M2 can run the eval harness against a fixed, complete incident
      set. **Deadline Sep 26.**

- [ ] **Referential-integrity tests** — `packages/warehouse/tests/`
      *Done when:* `uv run pytest packages/warehouse` asserts every planted incident
      is visible as a metric deviation, and FK integrity across the star schema.

**S3 gate (hard, Sep 28):** the hero scenario's numbers (revenue drop, margin drop,
recoverable cash) trace to your metrics and match the incident's declared
`true_dollar_impact`.

---

## What you hand off, and when

| To | Artifact | By |
| --- | --- | --- |
| M2 | Tool JSON schemas frozen | Sep 14 |
| M2 | `signals` table populated, all 3 domains, real detectors | Sep 19 |
| M2 | Frozen dataset snapshot + complete incident library | **Sep 26** |
| M4 | Schema + migration path that `cdk deploy` can reproduce on RDS | Sep 21 |

## Your items on the cut list (if a sprint slips — order matters)

1. 3rd source (**Accounting**) → ship Sales + Inventory only (keeps supplier-delay →
   stockout → revenue; loses the margin / cash leg).
2. Detector count → z-score + threshold only, drop week-over-week.

**Never cut:** the metric layer, the frozen dataset snapshot.

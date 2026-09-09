# Planted incident library

The planted incident library **is the eval ground truth**. Write these **before**
the agents — they define what success means.

Files live in
[`packages/generator/src/sage_generator/incidents/planted/`](../packages/generator/src/sage_generator/incidents/planted/),
one YAML per incident. Schema:
[`packages/generator/src/sage_generator/incidents/schema.py`](../packages/generator/src/sage_generator/incidents/schema.py).

## Each incident declares

| Field | Meaning |
| --- | --- |
| `id` | e.g. `0001-supplier-sg-textiles-slip` |
| `type` | `supplier_delay`, `price_error`, `cogs_creep`, `returns_spike`, `ar_ageing_blowout`, `margin_killing_discount`, `seasonal_shift`, `channel_mix_shift`, `dead_stock_buildup` |
| `difficulty` | `obvious` / `subtle` / `cross_domain_only` |
| `affected_entities` | SKUs, suppliers, channels, categories |
| `window` | `start` / `end` dates |
| `expected_signals` | Which `(metric_id, detector)` pairs should fire |
| `expected_causal_chain` | Ordered domain→claim steps the Correlator must recover |
| `true_dollar_impact` | Ground-truth `$` figure (for impact-error scoring) |
| `is_hero` | `true` for the one scripted end to end |

## Target: ~20 incidents across 12 months (committed scope)

Reachable from **Sales + Inventory + Accounting alone**:

- Supplier delays → stockouts
- Silent price errors
- Margin erosion from creeping COGS
- A returns spike on one SKU
- An AR ageing blowout
- A discount that killed margin without lifting volume
- Seasonal demand shifts (CNY, 11.11, Christmas)
- A channel-mix shift
- A dead-stock buildup

**Vary difficulty:**
- **Obvious** — large single-metric deviation.
- **Subtle** — slow drift, needs a rolling detector.
- **Cross-domain-only** — invisible from any single source. Aim for **4–5**. These
  prove the thesis. **The hero scenario is one of these**, scripted end to end
  (supplier delay → stockout → revenue + margin → recommended recovery action).

## Verification

Load the frozen dataset; assert **every** planted incident is visible as a metric
deviation. `pytest packages/warehouse` checks referential integrity and that metric
SQL returns sane values at every grain. See [`eval-plan.md`](eval-plan.md).

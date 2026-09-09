# SQL transforms

Ordered SQL models: raw → staging → facts/dims. One `.sql` file per model,
numbered for run order (`010_stg_orders.sql`, `100_fact_order_line.sql`, ...).
Runner: `sage_warehouse.models.run_transforms`.

# Metric catalog

The governed metric layer is the **contract between data and agents**. Agents get
`list_metrics()` and `query_metric()` over it — nothing else. Every claim in a
briefing traces back to a metric definition here.

Source of truth: [`packages/warehouse/src/sage_warehouse/metrics/metrics.yaml`](../packages/warehouse/src/sage_warehouse/metrics/metrics.yaml).

## Each metric declares

| Field | Meaning |
| --- | --- |
| `id` | Stable snake_case identifier agents cite |
| `label` | Human name for the brief |
| `sql` | Parameterised SQL; `{filters}` injected from `dimensions` + `period` |
| `grain` | Allowed time grains: `day` / `week` / `month` |
| `dimensions` | Allowed slice dimensions |
| `unit` | `SGD`, `pct`, `days`, `count`, `pct_points`, ... |
| `direction` | `higher_is_better` / `lower_is_better` / `neutral` |
| `detectors` | Which detectors run on it (`zscore_7d`, `wow_change`, `threshold`) |
| `thresholds` | For the `threshold` detector: `warn` / `critical` bounds |
| `owner_domain` | `sales` / `inventory` / `accounting` |

## Target coverage (~20–25 metrics for the committed scope)

### Sales
`gross_revenue`, `net_revenue`, `orders`, `average_order_value`, `units_sold`,
`refund_rate`, `channel_revenue_mix`, `discount_depth`, `revenue_per_sku`.

### Inventory
`days_of_cover`, `stock_on_hand_value`, `stockout_count`, `sell_through_rate`,
`supplier_lead_time_days`, `reorder_point_breaches`, `dead_stock_value`.

### Accounting
`gross_margin_pct`, `cogs`, `cogs_per_unit`, `ar_ageing_over_60d`,
`cash_position`, `days_sales_outstanding`, `supplier_bill_overdue_value`.

## Verification (golden-file tests)

Each metric queried at day/week/month grain against the frozen dataset produces
known values. Any drift fails CI. See [`eval-plan.md`](eval-plan.md).

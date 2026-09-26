# retail-mcp Tool Reference

What each tool in [`mcp/src/retail_mcp/server.py`](mcp/src/retail_mcp/server.py)
does, its parameters, and what it returns. Companion to
[`API_FLOW.md`](./API_FLOW.md) (the wire-level request/response flow) and
[`ARCHITECTURE.md`](./ARCHITECTURE.md) (the tenancy model these tools enforce).

Every tool below requires `tenant_id` and independently validates it against
`shared.tenants`/`shared.tenant_modules` server-side
(`retail_mcp/db.py::assert_tenant_active`) before touching that tenant's
Postgres schema — it never trusts the value at face value, even though the
agent is instructed to pass it verbatim. None of these tools can write,
delete, or modify anything (`readOnlyHint: True` on every one).

## Tools by domain

Which business area each tool answers questions about. "Composite" tools
join two or more domains in a single call rather than living in one.

| Domain | Tools | Underlying table(s) |
|---|---|---|
| Sales | `get_sales_timeseries`, `get_trending_products`, `get_seasonal_pattern`, `get_sku_lifecycle`, `get_channel_performance` | `fact_order_line` |
| Inventory | `get_inventory_status` | `fact_stock_movement` |
| Suppliers | `get_supplier_performance`, `get_expected_deliveries` | `fact_purchase_order` |
| Accounts | `get_accounts_status` | `fact_invoice` (receivable), `fact_bill` (payable) |
| Customer | `get_enquiry_summary`, `get_customer_enquiries` | `fact_customer_enquiry` |
| Operations | `get_operational_updates` | `fact_operational_update` |
| Composite (cross-domain) | `get_business_health_summary` (sales+inventory+suppliers+accounts+customer+operations), `get_stockout_root_causes` (inventory+suppliers), `compare_periods` (sales), `get_attention_items` (sales+inventory+suppliers+accounts+customer+operations), `get_benchmark_gap_analysis` (sales+accounts), `get_cash_flow_forecast` (sales+accounts), `simulate_reorder_impact` (inventory+suppliers) | multiple |
| Meta / infrastructure | `ping`, `describe_schema`, `get_data_freshness` | none / all tables (introspection) |

---

## `ping()`

Health probe. Returns `{"ok": true, "server": "retail-mcp", "time": <ISO
timestamp>}`. No `tenant_id` — this checks the server itself, not any
tenant's data.

## `describe_schema(tenant_id)`

Introspects the tenant's live Postgres schema (via SQLAlchemy `inspect`) and
returns every table with its columns and types. This is how the agent stays
schema-agnostic — it's told to call this before assuming what data exists,
rather than hardcoding column names. Returns `{table_name: [{name, type}, ...]}`.

## `get_sales_timeseries(tenant_id, metric, group_by=None, start_date=None, end_date=None)`

Daily sales timeseries from `fact_order_line`, one row per date (or per
date+group_by value).

- `metric` — one of `"revenue"`, `"units"`, `"refunds"`, `"margin"`,
  `"margin_pct"`. All validated against a fixed allowlist server-side.
  `margin`/`margin_pct` use each order line's own cost snapshot at time of
  sale (`fact_order_line.unit_cost_sgd`), not a live `dim_sku` cost.
- `group_by` — optional secondary breakdown: `"sku"`, `"channel"`,
  `"segment"`, or `"category"` (the last needs a `dim_sku` join, handled
  internally).
- `start_date`/`end_date` — optional inclusive `YYYY-MM-DD` bounds.

Includes judgement-context benchmarks in its docstring (typical refund rate
3-8%, typical margin 30-45% for this vertical) — reference ranges only, never
returned as if they were the tenant's actual data.

## `get_inventory_status(tenant_id, group_by=None, limit=50)`

Current stock on hand. `fact_stock_movement` is an event log (one row per
sale/receipt), not a snapshot — "current" means each SKU's most recent
`on_hand_after` row, found via `DISTINCT ON`.

- `group_by=None` — one total on-hand figure across the whole catalog.
- `group_by="sku"` — one row per SKU, ordered **lowest stock first**, capped
  by `limit` (default 50, max 500).
- `group_by="category"` — summed per category (no limit applied — category
  count is always small).

## `get_supplier_performance(tenant_id, supplier_id=None)`

Per-supplier delivery performance from `fact_purchase_order`: average lead
time (`received_date - ordered_date`) and average delay against the promised
date (`received_date - expected_date`), plus a PO count. Omit `supplier_id`
for every supplier. Docstring benchmark: delay consistently above ~5 days is
generally worth flagging.

## `get_accounts_status(tenant_id, kind, status=None, limit=50)`

Outstanding receivables or payables with due dates.

- `kind="receivable"` — customer invoices (`fact_invoice`).
- `kind="payable"` — supplier bills (`fact_bill`).
- `status` — optional filter, `"paid"` or `"open"`.
- `limit` — max rows, **oldest due_date first** (most urgent), default 50,
  max 500.

Docstring benchmark: an open balance more than ~60 days past due is
generally a cash-flow risk.

## `get_business_health_summary(tenant_id, start_date=None, end_date=None)`

Composite tool — one call across every domain instead of chaining the tools
above. Returns a single dict:

| Field | Source |
|---|---|
| `revenue`, `refunds` | Sales, for the given period |
| `total_on_hand`, `skus_out_of_stock` | Inventory, current state (not period-scoped) |
| `worst_supplier_id`, `worst_supplier_delay_days` | Current state; **null means no PO history exists**, not zero delay |
| `receivables_open`, `payables_open` | Current open balances |
| `enquiry_count`, `avg_csat` | Customer enquiries opened in the given period; `avg_csat` is `null` if none of them are resolved yet |
| `open_enquiries` | Current count of open + escalated enquiries (not period-scoped) |
| `open_critical_ops_updates` | Current count of unresolved critical operational updates (not period-scoped) |

`start_date`/`end_date` scope the sales and enquiry figures — inventory/
supplier/accounts/open-enquiry/open-ops-update counts are always
current-state.

## `get_stockout_root_causes(tenant_id, limit=50)`

Composite tool — cross-references every SKU currently at zero/negative stock
against its supplier's average delivery delay, so a stockout can be traced to
a slow supplier instead of reported alone. Returns one row per out-of-stock
SKU (`sku`, `category`, `supplier_id`, `supplier_avg_delay_days`), worst
delay first, capped by `limit`. `supplier_avg_delay_days` null means that
supplier has no PO history — don't assume the stockout is their fault.

## `compare_periods(tenant_id, metric, current_start, current_end, previous_start, previous_end, group_by=None)`

Percent-change comparison between two explicit date ranges — the caller
(agent) picks both periods; this tool doesn't infer "last month" or similar.
Same `metric`/`group_by` allowlists as `get_sales_timeseries`. Returns one
row (or one per `group_by` value) with `current_value`, `previous_value`,
`pct_change`, sorted biggest mover first. `pct_change` is `null` when the
previous period was zero — no baseline to compute a percentage from, not "0%
change."

## `get_attention_items(tenant_id)`

Composite tool — deterministic threshold checks across every domain in one
call, returned as a ranked list of concrete issues:

| Check | Threshold | Domain |
|---|---|---|
| Return rate (trailing 30 days) | > 8% of revenue | `sales` |
| Any SKU at zero/negative stock | > 0 | `inventory` |
| Supplier average delivery delay | > 5 days | `suppliers` |
| Open receivable/payable past due | > 60 days | `accounts` |
| Enquiry volume (trailing 7-day daily rate vs. the prior 28 days) | > 1.5x | `customer` |
| Enquiry average first-response time (trailing 30 days) | > 24 hours | `customer` |
| Any escalated enquiry still open | > 0 | `customer` |
| Any unresolved critical operational update | > 0 | `operations` |

Each item: `domain`, `issue`, `value`, `threshold`, `dollar_impact_est`
(null when not computable), `supplier_id` (null unless supplier-related).
Sorted by `dollar_impact_est` descending where known.

**These thresholds are fixed and generic — not tuned to any tenant's own
baseline.** A pattern that's genuinely unusual for one specific business but
stays under these numbers won't appear here. An empty result means "nothing
crossed a generic threshold," not "everything is fine."

**The critical-operational-update check is real, handled code but
structurally unreachable against the seeded `demo` dataset** — the generator
(`data/simulator/src/sage_simulator/simulate/operations.py`) never plants a
"critical"-severity update, only `info`/`warning` — the same kind of gap
`get_expected_deliveries` documents for `"not_yet_received"`. It will only
ever fire against a live tenant's own data.

## `get_benchmark_gap_analysis(tenant_id, start_date=None, end_date=None)`

Composite tool — compares this tenant's actual sales and accounting
outcomes to fixed industry-typical ranges and reports the **gap**, not just
whether a threshold was crossed. Different job than `get_attention_items`:
that tool flags a binary "crossed a line," this one shows a continuous
distance from a normal-looking range, in both directions.

- **Sales** (period-scoped by `start_date`/`end_date`): `refund_rate`
  (benchmark 3-8%) and `margin_pct` (benchmark 30-45%), both from
  `fact_order_line` — same figures as `get_sales_timeseries`'s docstring
  benchmarks, just computed and compared for you instead of quoted as
  reference text.
- **Accounts** (not period-scoped — uses every invoice/bill ever paid, since
  payment behavior needs a full sample): `receivable_avg_days_to_settle` and
  `payable_avg_days_to_settle`, i.e. `AVG(paid_date - date)` per table,
  benchmark 14-30 days (typical net terms for this vertical).

Returns one row per metric: `domain`, `metric`, `actual_value` (null if
uncomputable — no revenue in the period, or nothing paid yet), `benchmark_low`,
`benchmark_high`, `gap` (signed distance outside the range; `0` inside it,
`null` if `actual_value` is null), `status`
(`"below_benchmark"`/`"within_benchmark"`/`"above_benchmark"`/`null`).

**Direction matters, not just the label**: `margin_pct` above range is good.
`receivable_avg_days_to_settle` above range is a collection risk.
`payable_avg_days_to_settle` above range is ambiguous — could be a
deliberate cash-flow choice or a supplier-relationship risk; cross-check
`get_supplier_performance`/`get_accounts_status` before calling it a
problem.

## `get_trending_products(tenant_id, metric="units", window_days=14, as_of_date=None, limit=50)`

Per-SKU comparison between the trailing `window_days` and the `window_days`
immediately before it, from `fact_order_line` joined to `dim_sku`. Returns
only SKUs that are **genuinely rising**: a SKU with zero sales in the
previous window is excluded entirely (no baseline to call "trending"
against), not shown with an undefined/infinite percent change.

- `metric` — same allowlist as `get_sales_timeseries`. `"units"` (default)
  is usually the more honest trending signal than `"revenue"`, since revenue
  can rise from a price change alone.
- `window_days` — 1-180, default 14.
- `as_of_date` — optional `YYYY-MM-DD`, the end of the "current" window.
  Defaults to today's real date — **set this explicitly when testing
  against a seeded dataset whose calendar doesn't reach today**, or the
  current window is empty and every SKU silently drops out.
- `limit` — max SKUs returned, default 50, capped 500.

Returns one row per rising SKU: `sku`, `category`, `current_value`,
`previous_value`, `pct_change`, sorted fastest-growing first.

## `get_seasonal_pattern(tenant_id, metric="revenue", breakdown="month")`

Aggregates a metric across the tenant's **entire** order history (no
start/end date — pattern detection needs the full history, not one window)
by a calendar dimension:

- `breakdown="day_of_week"` — 7 rows, correctly ordered Mon→Sun. `dim_date.dow`
  is stored as free text (`"Mon".."Sun"`), which sorts alphabetically wrong
  (Fri, Mon, Sat, ...) — this tool orders by a fixed `CASE` expression instead.
- `breakdown="month"` — up to 12 rows, ordered 1→12.
- `breakdown="holiday"` — 2 rows (`false`/`true`), from `dim_date.is_holiday`.

Each row: `bucket`, `value`, `days_included` (distinct calendar days behind
that bucket — a bucket with noticeably fewer days than its peers is a
**partial period**, e.g. the dataset starts mid-year, not necessarily a
genuinely weaker season; check this before calling a dip real).

## `get_sku_lifecycle(tenant_id, metric="units", window_days=30, as_of_date=None, limit=50)`

Classifies every SKU with sales history into a stage — `"new"`,
`"growing"`, `"stable"`, `"declining"`, `"dead"` — from its own trailing
trend. Complements `get_trending_products`: that tool only ever returns
SKUs that are rising (pace-of-change); this one classifies the whole
catalog, including SKUs that have gone quiet.

- `metric`/`window_days`/`as_of_date` — same semantics as
  `get_trending_products`. Total lookback is `2 * window_days` (current
  window vs. the one before it).
- Stage rules (fixed, generic — same discipline as `get_attention_items`'s
  thresholds): `new` = first-ever sale inside the current window; `dead` =
  zero activity in the current window (regardless of history — a stockout
  can also cause this, cross-check `get_inventory_status`); `growing` =
  >=20% up on the previous window, or previous was zero and current isn't;
  `declining` = >=20% down; `stable` = within +/-20%.

Returns one row per SKU: `sku`, `category`, `first_sale_date`,
`previous_value`, `current_value`, `pct_change` (null if the previous
window was zero), `stage`. Sorted `dead` → `declining` (worst first) →
`new` → `growing` (best first) → `stable` — most-actionable stages first.

## `get_channel_performance(tenant_id, start_date=None, end_date=None)`

Sales channels side by side for a period: `channel`, `order_count`,
`revenue`, `units`, `refunds`, `avg_order_value`, `refund_rate`,
`avg_units_per_order` — sorted revenue descending.

**`avg_units_per_order` is a basket-size proxy, not a true attach rate.**
`data/simulator/src/sage_simulator/simulate/sales.py` models one order as
exactly one order line (a single SKU per order) — there's no multi-item
basket in this dataset to compute a real cross-sell attach rate from.
`avg_units_per_order` (quantity per order) is the closest honest signal
available; don't present it to the tenant as basket diversity.

## `get_cash_flow_forecast(tenant_id, horizon_days=30, as_of_date=None)`

Composite tool — naive short-horizon cash projection combining two
different kinds of number in one result: exact known obligations (open
receivables/payables whose `due_date` falls inside the horizon — not
projected, read directly) and projected new sales revenue (extrapolated
from historical day-of-week averages — genuinely a projection, seasonal-
adjusted by weekday only).

Returns one dict: `as_of_date`, `horizon_end_date`,
`receivables_due_in_window` (exact), `payables_due_in_window` (exact),
`projected_new_sales_revenue` (naive), `net_projected_cash_flow` (sum of
the three above, receivables and projected revenue minus payables).

**Real limitations, by design left visible rather than smoothed over**:
no cash-balance table exists in this schema, so there's no starting
balance — this is a net *flow*, not an ending balance. New sales revenue
is treated as immediate cash, i.e. it does not model a credit-segment
order becoming a delayed receivable instead of cash today. Seasonality is
day-of-week only (no monthly/holiday adjustment). It's a directional
estimate, not a number precise enough to plan payroll against.

## `simulate_reorder_impact(tenant_id, sku, proposed_qty, order_date=None)`

A what-if, not a report: given a proposed PO quantity and order date,
projects `days_of_supply` and stockout risk — the "agent gives actionable
advice" tool, distinct from every other tool here which only describes
what already happened or is already scheduled. Still `readOnlyHint: True`
— it estimates the effect of an order, it never creates one.

Method (explicitly naive/linear, stated in the docstring so it's never
read as a precise forecast): `avg_daily_demand` = this SKU's trailing
60-day average units/day, anchored to the **latest date this tenant's
sales data actually reaches** (not `CURRENT_DATE`) — sidesteps the
seeded-dataset-calendar trap other date-window tools have to be told about
explicitly via `as_of_date`. `avg_supplier_lead_time_days` = this SKU's
supplier's historical average `received_date - ordered_date` across every
PO they've ever had, not anything specific to this proposed order. Demand
is assumed constant between now and arrival (no seasonality modeled).

Returns: `sku`, `category`, `supplier_id`, `current_on_hand`,
`avg_daily_demand`, `demand_window_days` (always 60), `order_date`,
`avg_supplier_lead_time_days` (null if the supplier has no PO history),
`expected_arrival_date`, `projected_on_hand_at_arrival` (can go negative —
that's the estimated stockout size before the order lands),
`on_hand_after_receipt`, `days_of_supply_after_receipt`, `stockout_risk`:
`"high"` (runs out before the order arrives), `"moderate"` (arrives in
time, leaves under 14 days of supply), `"low"` (comfortable), or
`"insufficient_data"` (no recent demand or no supplier PO history to
estimate from — every other field except the identity ones is null in
this case).

## `get_enquiry_summary(tenant_id, group_by="topic", start_date=None, end_date=None)`

Customer enquiry volume and outcomes, grouped by a dimension — the
enquiry-side equivalent of `get_sales_timeseries`.

- `group_by` — `"topic"` (default), `"contact_channel"`, `"segment"`,
  `"sku"`, `"category"` (joins `dim_sku`, so an enquiry with no `sku` is
  excluded from this breakdown rather than grouped under a null category),
  or `"week"` (calendar week starting Monday, via `DATE_TRUNC`, labeled by
  that week's start date — not `dim_date.week`, an ISO week number that
  resets every January and would collide across the two years a 15-month
  dataset can span).
- `start_date`/`end_date` — optional inclusive bounds on the enquiry's
  opened date. Omit for all-time.

Returns one row per group: the group column, `enquiry_count`, `open_count`,
`escalated_count`, `avg_first_response_hours`, `avg_resolution_days`
(resolved enquiries only, `null` if none resolved), `avg_csat` (resolved
only, `null` if none resolved). Sorted by `enquiry_count` descending, except
`group_by="week"` which sorts chronologically.

Judgement context: a first response under ~24 hours and an average CSAT of
~4 or higher are typical for this vertical; any `escalated_count` above zero
is worth a look regardless of volume.

## `get_customer_enquiries(tenant_id, topic=None, status=None, sku=None, start_date=None, end_date=None, limit=50)`

Individual customer enquiries, most actionable first — the enquiry-side
equivalent of `get_accounts_status`. Use `get_enquiry_summary` for aggregate
questions; use this tool to see the actual tickets.

- `topic` — optional, one of `"order_status"`, `"return_refund"`,
  `"stock_availability"`, `"billing"`, `"product_question"`, `"complaint"`.
- `status` — optional, `"open"`, `"resolved"`, or `"escalated"`.
- `sku` — optional, restrict to one SKU.
- `start_date`/`end_date` — optional inclusive bounds on the opened date.
- `limit` — default 50, capped at 500.

Returns one row per enquiry: `enquiry_id`, `date`, `contact_channel`,
`segment`, `topic`, `order_id` (null if not tied to an order), `sku` (null
if not product-specific), `priority`, `status`, `first_response_hours`,
`resolved_date` (null if not yet resolved), `csat_score` (null unless
resolved). Sorted escalated → open → resolved, then high priority first,
then oldest first within each group.

## `get_operational_updates(tenant_id, area=None, severity=None, status=None, start_date=None, end_date=None, limit=50)`

The internal operations log — notices staff logged about supply, logistics,
promotions, finance, store operations, staffing, and systems. **This is a
curated log, not full visibility into every operational event**: it will not
mention every anomaly visible in the business's other data (see
`data/simulator/src/sage_simulator/simulate/operations.py` — incident types
meant to stay hidden from the agent are deliberately never logged here), and
an empty result doesn't mean nothing happened, only that nothing was logged.

- `area` — optional, one of `"logistics"`, `"supply"`, `"promotions"`,
  `"finance"`, `"store_ops"`, `"staffing"`, `"systems"`.
- `severity` — optional, `"info"`, `"warning"`, or `"critical"`.
- `status` — optional, `"open"` or `"resolved"`.
- `start_date`/`end_date` — optional inclusive bounds on the update's date.
- `limit` — default 50, capped at 500.

Returns one row per update: `update_id`, `date`, `area`, `severity`,
`title`, `detail`, `supplier_id` (null unless supplier-related), `channel`
(null unless channel-related), `category` (null unless category-related),
`status`, `resolved_date` (null if still open). Sorted newest first.

## `get_data_freshness(tenant_id)`

Meta tool — "can I trust this number right now." No table in this schema
carries an ingest/load timestamp, so this reports the latest
**business-event** date each table contains (newest sale, stock movement,
PO activity, or invoice/bill date) as the closest honest freshness proxy.

Returns one row per table in `fact_order_line`, `fact_stock_movement`,
`fact_purchase_order`, `fact_invoice`, `fact_bill`, `fact_customer_enquiry`,
`fact_operational_update`: `table`, `last_business_date`, `days_since`
(`CURRENT_DATE - last_business_date`), `row_count`. Sorted stalest first.

**Demo-data caveat**: against the seeded `demo` tenant (fixed calendar
2025-09-01 to 2026-02-28), every table reports a large, fixed `days_since`
relative to the real clock — expected for a static seed, not a real
staleness problem. On a live (non-demo) tenant, one table lagging
noticeably behind the others here is the actionable signal.

## `get_expected_deliveries(tenant_id, start_date=None, end_date=None, limit=50)`

Purchase orders whose `expected_date` falls within a window — the
forward-looking complement to `get_supplier_performance`'s historical
averages. `start_date` defaults to today; `end_date` defaults to
`start_date` (a single day) when omitted.

Returns one row per PO: `po_id`, `sku`, `supplier_id`, `expected_date`,
`received_date`, `qty`, `status` (`"received_on_time"`, `"received_late"`,
or `"not_yet_received"`), soonest `expected_date` first, capped by `limit`.

**Important caveat baked into the tool's own docstring**: the current
seeded dataset only ever generates *completed* purchase orders — every row
already has a concrete `received_date` (`nullable=False` in `db/schema.py`).
So `status` will only ever be `"received_on_time"` or `"received_late"` for
this data; `"not_yet_received"` is real, handled code (for a production
tenant whose live data could have genuinely pending orders with a null
`received_date`), but structurally unreachable against `demo`'s seeded data.

## `GET /health` (not an MCP tool)

Plain HTTP route (`retail-mcp:9100/health`), not part of the MCP tool
protocol — used by Docker's healthcheck and for manual liveness checks.
Returns `{"status": "ok"}`.

---

## Shared engineering notes across every tool

- **SQL injection**: every value a caller supplies is bound as a SQLAlchemy
  parameter, never string-interpolated. The only string-interpolated
  fragments are fixed literals selected from a Python allowlist dict
  (`_METRICS`, `_GROUP_BY`, `_ACCOUNTS_TABLES`) — the caller picks a *key*,
  never the SQL fragment itself.
- **Tenant isolation**: `SET search_path TO "<tenant_id>"` scopes every query
  to that tenant's schema, after `assert_tenant_active` has already validated
  it against the `shared` control-plane tables.
- **Nullable-parameter typing**: any `WHERE (CAST(:x AS <type>) IS NULL OR
  ...)` pattern casts on *both* sides of the `OR` — Postgres/psycopg can't
  infer a bound parameter's type from an untyped `IS NULL` check alone (see
  the `AmbiguousParameter` bug this fixed, still visible in git history).
- **Row limits**: any tool that can return one row per SKU/bill/etc. takes a
  `limit` (default 50, capped 500 via `_clamp_limit`), ordered by
  actionability (lowest stock, oldest overdue, worst delay) — never an
  arbitrary or alphabetical subset.

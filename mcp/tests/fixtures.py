"""Deterministic fixture dataset for retail_mcp's tool tests, plus the small
aggregation helpers tests use to compute expected values independently of
the tools' own SQL.

Two anchors, deliberately kept separate:

- REF_DATE (2025-06-15): every date-window tool under test (get_sales_timeseries,
  compare_periods, get_trending_products, get_sku_lifecycle, simulate_reorder_impact,
  get_cash_flow_forecast, get_business_health_summary, get_benchmark_gap_analysis)
  either takes an explicit as_of_date/start_date/end_date or is queried with one, so
  tests always pin dates to this fixed calendar — never the real clock.
- TODAY (real date.today()): get_attention_items has NO as_of_date parameter — its
  return-rate check filters `date >= CURRENT_DATE - 30d` and its overdue check filters
  `CURRENT_DATE - due_date > 60`, both against Postgres's real wall-clock NOW(). A
  handful of rows are anchored here specifically so that tool's branches trigger
  regardless of what day the suite actually runs on.

Every "expected value" in the tests is computed by filtering/summing this same
row data in plain Python (see the metric_total/units_total/etc. helpers), not by
hand-copied numbers — so a test failure means the tool's SQL disagrees with a
straightforward reading of the same data, not a transcription slip.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

# Matches data/simulator/src/sage_simulator/config.py's WEEKDAYS exactly — dim_date.dow
# must be one of these ("Mon".."Sun"), which server.py's _WEEKDAY_CASE relies on for
# get_seasonal_pattern(breakdown="day_of_week")'s calendar-order sort.
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

TENANT_ID = "test_retail_mcp"

REF_DATE = date(2025, 6, 15)  # "as_of" for every explicitly-dated tool test
# get_attention_items filters against Postgres's CURRENT_DATE (the db container's own
# clock, UTC by default), not Python's local time — anchor to UTC here to match it.
TODAY = datetime.now(UTC).date()

WINDOW_DAYS = 14  # used by every get_trending_products / get_sku_lifecycle test
# Current window: (REF_DATE - WINDOW_DAYS, REF_DATE] = 2025-06-02..2025-06-15
CURRENT_WINDOW_START = REF_DATE - timedelta(days=WINDOW_DAYS)
# Previous window: (REF_DATE - 2*WINDOW_DAYS, REF_DATE - WINDOW_DAYS] = 2025-05-19..2025-06-01
PREVIOUS_WINDOW_START = REF_DATE - timedelta(days=2 * WINDOW_DAYS)

# ---------------------------------------------------------------------------
# Dimensions
# ---------------------------------------------------------------------------

CHANNELS = [
    {"channel": "online", "revenue_share": 0.6, "avg_order_value_sgd": 150.0},
    {"channel": "store", "revenue_share": 0.4, "avg_order_value_sgd": 200.0},
]

SEGMENTS = [
    {"segment": "retail", "label": "Retail", "order_share": 0.7, "pays_on_credit": False},
    {"segment": "wholesale", "label": "Wholesale", "order_share": 0.3, "pays_on_credit": True},
]

# Each supplier is used by exactly one simulate_reorder_impact scenario below, so
# its avg_lead_time_days/avg_delay_days come from exactly one PO — no averaging
# across unrelated scenarios to keep straight.
SUPPLIERS = [
    {  # on-time, low delay — TABLE-1's "moderate" reorder scenario
        "supplier_id": "SUP-FAST",
        "name": "Fast Supplier",
        "country": "SG",
        "lead_time_days": 7,
        "on_time_rate": 0.98,
        "payment_terms_days": 30,
    },
    {  # 10-day delay, over the 5-day attention threshold — CHAIR-2's "high" reorder scenario
        "supplier_id": "SUP-SLOW",
        "name": "Slow Supplier",
        "country": "CN",
        "lead_time_days": 30,
        "on_time_rate": 0.4,
        "payment_terms_days": 30,
    },
    {  # on-time, short lead — TABLE-2's "low" reorder scenario
        "supplier_id": "SUP-MED",
        "name": "Medium Supplier",
        "country": "MY",
        "lead_time_days": 5,
        "on_time_rate": 0.9,
        "payment_terms_days": 30,
    },
]

SKUS = [
    {"sku": "SKU-CHAIR-1", "name": "Dining Chair", "category": "Chairs", "subcategory": "Dining",
     "supplier_id": "SUP-FAST", "unit_cost_sgd": 50.0, "list_price_sgd": 100.0, "abc_class": "A"},
    {"sku": "SKU-CHAIR-2", "name": "Accent Chair", "category": "Chairs", "subcategory": "Dining",
     "supplier_id": "SUP-SLOW", "unit_cost_sgd": 60.0, "list_price_sgd": 120.0, "abc_class": "B"},
    {"sku": "SKU-TABLE-1", "name": "Dining Table", "category": "Tables", "subcategory": "Dining",
     "supplier_id": "SUP-FAST", "unit_cost_sgd": 80.0, "list_price_sgd": 200.0, "abc_class": "A"},
    {"sku": "SKU-TABLE-2", "name": "Side Table", "category": "Tables", "subcategory": "Occasional",
     "supplier_id": "SUP-MED", "unit_cost_sgd": 40.0, "list_price_sgd": 90.0, "abc_class": "C"},
    {"sku": "SKU-LAMP-1", "name": "Table Lamp", "category": "Lighting", "subcategory": "Table Lamp",
     "supplier_id": "SUP-FAST", "unit_cost_sgd": 20.0, "list_price_sgd": 45.0, "abc_class": "C"},
    {"sku": "SKU-RUG-1", "name": "Area Rug", "category": "Home Textiles", "subcategory": "Rug",
     "supplier_id": "SUP-FAST", "unit_cost_sgd": 30.0, "list_price_sgd": 70.0, "abc_class": "B"},
    {"sku": "SKU-VASE-1", "name": "Ceramic Vase", "category": "Decor", "subcategory": "Vase",
     "supplier_id": "SUP-FAST", "unit_cost_sgd": 15.0, "list_price_sgd": 35.0, "abc_class": "C"},
    # Used ONLY for the get_seasonal_pattern(breakdown="holiday") test — its one
    # sale lands exactly on HOLIDAY_DATE, which sits inside the trending/
    # lifecycle "previous window" too, so it's kept off every SKU those tests
    # actually track to avoid perturbing their hand-computed expectations.
    {"sku": "SKU-DECOY-1", "name": "Holiday Decoy", "category": "Misc", "subcategory": "Misc",
     "supplier_id": "SUP-FAST", "unit_cost_sgd": 10.0, "list_price_sgd": 50.0, "abc_class": "C"},
]
SKU_BY_ID = {s["sku"]: s for s in SKUS}

# ---------------------------------------------------------------------------
# dim_date — the fixed 2025 calendar plus a small window around real "today"
# (fact_order_line.date/fact_stock_movement.date carry a real FK to dim_date.date,
# so every date used anywhere below must have a row here).
# ---------------------------------------------------------------------------


def _date_row(d: date, holiday_name: str | None = None) -> dict:
    return {
        "date": d,
        "dow": WEEKDAYS[d.weekday()],
        "week": d.isocalendar()[1],
        "month": d.month,
        "quarter": (d.month - 1) // 3 + 1,
        "year": d.year,
        "is_holiday": holiday_name is not None,
        "holiday_name": holiday_name,
    }


def _date_range(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


HOLIDAY_DATE = date(2025, 6, 1)  # falls inside a sale below, for breakdown="holiday"

DATES = [
    _date_row(d, "Test Holiday" if d == HOLIDAY_DATE else None)
    for d in _date_range(date(2025, 1, 1), date(2025, 7, 15))
] + [
    _date_row(d) for d in _date_range(TODAY - timedelta(days=100), TODAY)
]

# ---------------------------------------------------------------------------
# fact_order_line — the master sales dataset. Every "expected" total in the
# tests is computed by summing/filtering THIS list, mirroring _METRICS in
# server.py exactly (revenue/units/margin sum every row incl. refunds; only
# the "refunds" metric itself filters to is_refund rows — that's the real
# app's own metric semantics, see sage_simulator/simulate/sales.py: a refund
# line's line_total_sgd is stored positive, never netted against revenue).
# ---------------------------------------------------------------------------


def _line(order_id, sku, d, qty, unit_price, *, channel="online", segment="retail", is_refund=False):
    cost = SKU_BY_ID[sku]["unit_cost_sgd"]
    return {
        "order_id": order_id,
        "line_id": f"{order_id}-L1",
        "date": d,
        "sku": sku,
        "channel": channel,
        "segment": segment,
        "qty": qty,
        "unit_price_sgd": float(unit_price),
        "unit_cost_sgd": float(cost),
        "line_total_sgd": round(qty * float(unit_price), 2),
        "is_refund": is_refund,
    }


ORDER_LINES = [
    # SKU-CHAIR-1: "stable" lifecycle (10 -> 11 units, +10%), online/retail.
    _line("O-C1-PREV", "SKU-CHAIR-1", date(2025, 5, 25), 10, 100, channel="online", segment="retail"),
    _line("O-C1-CURR", "SKU-CHAIR-1", date(2025, 6, 10), 11, 100, channel="online", segment="retail"),
    # A 2025-range refund, dated well outside both lifecycle windows so it only
    # affects whole-history/whole-range aggregates (get_benchmark_gap_analysis,
    # get_business_health_summary), never the windowed trending/lifecycle math.
    _line("O-C1-REFUND", "SKU-CHAIR-1", date(2025, 3, 1), 1, 100, channel="online", segment="retail", is_refund=True),

    # SKU-CHAIR-2: driven to zero stock (see STOCK_MOVEMENTS) — stockout root
    # cause + "high" reorder-risk scenario.
    _line("O-C2-PREV", "SKU-CHAIR-2", date(2025, 5, 25), 5, 120, channel="store", segment="retail"),
    _line("O-C2-CURR", "SKU-CHAIR-2", date(2025, 6, 15), 5, 120, channel="store", segment="retail"),

    # SKU-TABLE-1: "growing" lifecycle (20 -> 40 units, +100%) + "moderate" reorder risk.
    _line("O-T1-PREV", "SKU-TABLE-1", date(2025, 5, 25), 20, 200, channel="online", segment="wholesale"),
    _line("O-T1-CURR", "SKU-TABLE-1", date(2025, 6, 10), 40, 200, channel="online", segment="wholesale"),

    # SKU-TABLE-2: "declining" lifecycle (40 -> 10 units, -75%) + "low" reorder risk.
    _line("O-T2-PREV", "SKU-TABLE-2", date(2025, 5, 25), 40, 90, channel="store", segment="wholesale"),
    _line("O-T2-CURR", "SKU-TABLE-2", date(2025, 6, 10), 10, 90, channel="store", segment="wholesale"),

    # SKU-LAMP-1: "new" lifecycle — first-ever sale falls inside the current window.
    _line("O-L1-NEW", "SKU-LAMP-1", date(2025, 6, 12), 3, 45, channel="online", segment="retail"),

    # SKU-RUG-1: "dead" lifecycle — sold in the previous window, nothing since.
    _line("O-R1-PREV", "SKU-RUG-1", date(2025, 5, 25), 8, 70, channel="store", segment="retail"),

    # SKU-VASE-1 has no rows at all: zero recent demand -> simulate_reorder_impact
    # "insufficient_data".

    # SKU-DECOY-1: the only fixture row dated exactly on HOLIDAY_DATE, so
    # get_seasonal_pattern(breakdown="holiday") has a non-empty True bucket.
    _line("O-DECOY-HOLIDAY", "SKU-DECOY-1", HOLIDAY_DATE, 6, 50, channel="store", segment="retail"),
]

# TODAY-relative rows, isolated to get_attention_items' return-rate branch (real
# CURRENT_DATE - 30d window). Kept off every other test's explicit date ranges
# (all in 2025) so they can't contaminate those totals.
ATTENTION_RETURN_RATE_LINES = [
    _line("O-ATT-SALE", "SKU-CHAIR-1", TODAY - timedelta(days=5), 10, 100, channel="online", segment="retail"),
    _line("O-ATT-REFUND", "SKU-CHAIR-1", TODAY - timedelta(days=4), 2, 100, channel="online", segment="retail", is_refund=True),
]

# simulate_reorder_impact's avg_daily_demand always anchors to the trailing 60
# days ending at MAX(date) across the WHOLE fact_order_line table — a single
# global anchor, not per-SKU and not controlled by the order_date argument.
# Because ATTENTION_RETURN_RATE_LINES above are dated near the real TODAY,
# that global max is effectively TODAY - 4, not REF_DATE — so the 2025-dated
# rows above are always outside its 60-day window. These rows exist purely to
# give CHAIR-2/TABLE-1/TABLE-2 controlled demand inside that *real* window,
# at TODAY-45: inside the 60-day demand window, but outside the 30-day
# return-rate window above, so they can't dilute that check's ratio.
REORDER_DEMAND_LINES = [
    _line("O-REORDER-C2", "SKU-CHAIR-2", TODAY - timedelta(days=45), 10, 120, channel="store", segment="retail"),
    _line("O-REORDER-T1", "SKU-TABLE-1", TODAY - timedelta(days=45), 60, 200, channel="online", segment="wholesale"),
    _line("O-REORDER-T2", "SKU-TABLE-2", TODAY - timedelta(days=45), 50, 90, channel="store", segment="wholesale"),
]

ALL_ORDER_LINES = ORDER_LINES + ATTENTION_RETURN_RATE_LINES + REORDER_DEMAND_LINES

# ---------------------------------------------------------------------------
# fact_stock_movement — "current" on-hand is each SKU's latest row by
# (date, movement_id), not a sum, so every SKU below gets a receipt then a
# later sale/adjustment to make that distinction actually matter.
# ---------------------------------------------------------------------------

STOCK_MOVEMENTS = [
    {"movement_id": "M-C1-1", "date": date(2025, 1, 5), "sku": "SKU-CHAIR-1", "movement_type": "receipt", "qty": 50, "on_hand_after": 50},
    {"movement_id": "M-C1-2", "date": date(2025, 6, 10), "sku": "SKU-CHAIR-1", "movement_type": "sale", "qty": -20, "on_hand_after": 30},

    {"movement_id": "M-C2-1", "date": date(2025, 1, 5), "sku": "SKU-CHAIR-2", "movement_type": "receipt", "qty": 20, "on_hand_after": 20},
    {"movement_id": "M-C2-2", "date": date(2025, 6, 15), "sku": "SKU-CHAIR-2", "movement_type": "sale", "qty": -20, "on_hand_after": 0},

    {"movement_id": "M-T1-1", "date": date(2025, 1, 5), "sku": "SKU-TABLE-1", "movement_type": "receipt", "qty": 30, "on_hand_after": 30},
    {"movement_id": "M-T1-2", "date": date(2025, 6, 10), "sku": "SKU-TABLE-1", "movement_type": "sale", "qty": -20, "on_hand_after": 10},

    {"movement_id": "M-T2-1", "date": date(2025, 1, 5), "sku": "SKU-TABLE-2", "movement_type": "receipt", "qty": 120, "on_hand_after": 120},
    {"movement_id": "M-T2-2", "date": date(2025, 6, 10), "sku": "SKU-TABLE-2", "movement_type": "sale", "qty": -20, "on_hand_after": 100},

    {"movement_id": "M-L1-1", "date": date(2025, 6, 12), "sku": "SKU-LAMP-1", "movement_type": "receipt", "qty": 15, "on_hand_after": 15},
    {"movement_id": "M-R1-1", "date": date(2025, 5, 25), "sku": "SKU-RUG-1", "movement_type": "receipt", "qty": 12, "on_hand_after": 12},
    # SKU-VASE-1 has no stock rows at all -> current_on_hand defaults to 0.
]

# Expected "current" on-hand per SKU, i.e. the latest row above per sku — used
# directly by the inventory tests instead of re-deriving "latest" in Python.
CURRENT_ON_HAND = {
    "SKU-CHAIR-1": 30,
    "SKU-CHAIR-2": 0,
    "SKU-TABLE-1": 10,
    "SKU-TABLE-2": 100,
    "SKU-LAMP-1": 15,
    "SKU-RUG-1": 12,
    "SKU-VASE-1": 0,
}

# ---------------------------------------------------------------------------
# fact_purchase_order
# ---------------------------------------------------------------------------

PURCHASE_ORDERS = [
    # SUP-FAST / SKU-TABLE-1: on-time, 7-day lead -> "moderate" reorder risk.
    {"po_id": "PO-FAST-1", "sku": "SKU-TABLE-1", "supplier_id": "SUP-FAST",
     "ordered_date": date(2025, 6, 1), "expected_date": date(2025, 6, 8), "received_date": date(2025, 6, 8),
     "qty": 30, "unit_cost_sgd": 80.0},
    # SUP-SLOW / SKU-CHAIR-2: 20-day lead, 10-day delay -> attention_items +
    # stockout_root_causes + "high" reorder risk.
    {"po_id": "PO-SLOW-1", "sku": "SKU-CHAIR-2", "supplier_id": "SUP-SLOW",
     "ordered_date": date(2025, 5, 1), "expected_date": date(2025, 5, 11), "received_date": date(2025, 5, 21),
     "qty": 20, "unit_cost_sgd": 60.0},
    # SUP-MED / SKU-TABLE-2: on-time, 5-day lead -> "low" reorder risk.
    {"po_id": "PO-MED-1", "sku": "SKU-TABLE-2", "supplier_id": "SUP-MED",
     "ordered_date": date(2025, 6, 5), "expected_date": date(2025, 6, 10), "received_date": date(2025, 6, 10),
     "qty": 120, "unit_cost_sgd": 40.0},
]

# ---------------------------------------------------------------------------
# fact_invoice (receivables) / fact_bill (payables)
# ---------------------------------------------------------------------------

INVOICES = [
    # Paid, settled in 19/21 days -> avg 20d, within the 14-30d benchmark.
    {"invoice_id": "INV-1", "order_id": "O-C1-CURR", "segment": "retail",
     "date": date(2025, 5, 1), "due_date": date(2025, 5, 15), "paid_date": date(2025, 5, 20),
     "amount_sgd": 500.0, "status": "paid"},
    {"invoice_id": "INV-2", "order_id": "O-T1-CURR", "segment": "wholesale",
     "date": date(2025, 5, 10), "due_date": date(2025, 5, 24), "paid_date": date(2025, 5, 31),
     "amount_sgd": 1000.0, "status": "paid"},
    # Open, due inside the get_cash_flow_forecast(as_of=REF_DATE, horizon=30) window.
    {"invoice_id": "INV-CF-IN", "order_id": "O-T1-CURR", "segment": "wholesale",
     "date": date(2025, 6, 1), "due_date": date(2025, 6, 25), "paid_date": None,
     "amount_sgd": 1500.0, "status": "open"},
    # Open, due AFTER that window -> must be excluded from the forecast sum.
    {"invoice_id": "INV-CF-OUT", "order_id": "O-T1-CURR", "segment": "wholesale",
     "date": date(2025, 6, 1), "due_date": date(2025, 8, 1), "paid_date": None,
     "amount_sgd": 9999.0, "status": "open"},
    # Open + 70 days overdue vs (real) TODAY -> get_attention_items receivable_overdue.
    {"invoice_id": "INV-OVERDUE", "order_id": "O-C2-CURR", "segment": "retail",
     "date": TODAY - timedelta(days=100), "due_date": TODAY - timedelta(days=70), "paid_date": None,
     "amount_sgd": 2081.0, "status": "open"},
]

BILLS = [
    # Paid, settled in 40 days each -> avg 40d, ABOVE the 14-30d benchmark.
    {"bill_id": "BILL-1", "po_id": "PO-FAST-1", "supplier_id": "SUP-FAST",
     "date": date(2025, 5, 1), "due_date": date(2025, 5, 15), "paid_date": date(2025, 6, 10),
     "amount_sgd": 800.0, "status": "paid"},
    {"bill_id": "BILL-2", "po_id": "PO-SLOW-1", "supplier_id": "SUP-SLOW",
     "date": date(2025, 5, 5), "due_date": date(2025, 5, 19), "paid_date": date(2025, 6, 14),
     "amount_sgd": 1200.0, "status": "paid"},
    # Open, due inside the cash-flow-forecast window.
    {"bill_id": "BILL-CF-IN", "po_id": "PO-MED-1", "supplier_id": "SUP-MED",
     "date": date(2025, 6, 1), "due_date": date(2025, 7, 1), "paid_date": None,
     "amount_sgd": 700.0, "status": "open"},
    # Open + 65 days overdue vs (real) TODAY -> get_attention_items payable_overdue.
    {"bill_id": "BILL-OVERDUE", "po_id": "PO-SLOW-1", "supplier_id": "SUP-SLOW",
     "date": TODAY - timedelta(days=100), "due_date": TODAY - timedelta(days=65), "paid_date": None,
     "amount_sgd": 900.0, "status": "open"},
]

# ---------------------------------------------------------------------------
# Aggregation helpers mirroring server.py's _METRICS exactly (see the module
# docstring above for why revenue/units/margin sum every row, refunds included).
# ---------------------------------------------------------------------------


def in_range(rows: list[dict], start: date | None, end: date | None) -> list[dict]:
    return [r for r in rows if (start is None or r["date"] >= start) and (end is None or r["date"] <= end)]


def metric_total(rows: list[dict], metric: str) -> float | None:
    if metric == "revenue":
        return round(sum(r["line_total_sgd"] for r in rows), 2)
    if metric == "units":
        return sum(r["qty"] for r in rows)
    if metric == "refunds":
        return round(sum(r["line_total_sgd"] for r in rows if r["is_refund"]), 2)
    if metric == "margin":
        return round(sum(r["line_total_sgd"] for r in rows) - sum(r["qty"] * r["unit_cost_sgd"] for r in rows), 2)
    if metric == "margin_pct":
        revenue = sum(r["line_total_sgd"] for r in rows)
        margin = revenue - sum(r["qty"] * r["unit_cost_sgd"] for r in rows)
        return margin / revenue if revenue else None
    raise ValueError(metric)

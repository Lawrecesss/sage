"""get_customer_enquiries — backlog as of a moment, triage, and handling flow."""

from __future__ import annotations

from datetime import timedelta

import pytest
from fixtures import ENQ_AS_OF, TENANT_ID

from retail_mcp.server import get_customer_enquiries

AS_OF = ENQ_AS_OF.isoformat()


def _by_id(result: dict) -> dict[str, dict]:
    return {i["enquiry_id"]: i for i in result["items"]}


def test_bad_timestamps_raise():
    with pytest.raises(ValueError, match="as_of"):
        get_customer_enquiries(TENANT_ID, as_of="not-a-date")
    with pytest.raises(ValueError, match="window_start must be before"):
        get_customer_enquiries(TENANT_ID, as_of=AS_OF, window_start=AS_OF)
    with pytest.raises(ValueError, match="at most"):
        get_customer_enquiries(TENANT_ID, as_of=AS_OF, window_start=(ENQ_AS_OF - timedelta(days=91)).isoformat())


def test_open_backlog_excludes_resolved_and_future_enquiries():
    result = get_customer_enquiries(TENANT_ID, as_of=AS_OF)
    ids = set(_by_id(result))
    # Resolved after as_of still counts as open; resolved before it and created after it don't.
    assert "E-RESOLVED-AFTER" in ids
    assert not ids & {"E-RESOLVED-IN-SLA", "E-RESOLVED-LATE", "E-FUTURE"}
    assert result["backlog"]["open"] == 8


def test_attention_triage():
    items = _by_id(get_customer_enquiries(TENANT_ID, as_of=AS_OF))
    assert items["E-URGENT-LATE"]["attention"] == "immediate"  # late + urgent
    assert items["E-UNANSWERED-LATE"]["attention"] == "immediate"  # late + never answered
    assert items["E-LOW-VERY-LATE"]["attention"] == "immediate"  # 48h+ late
    assert items["E-COMPLAINT-LATE"]["attention"] == "immediate"  # late complaint
    assert items["E-NORMAL-LATE"]["attention"] == "overdue"
    assert items["E-DUE-SOON"]["attention"] == "due_soon"
    assert items["E-ON-TRACK"]["attention"] == "on_track"
    assert items["E-RESOLVED-AFTER"]["attention"] == "on_track"
    assert items["E-NORMAL-LATE"]["hours_overdue"] == 2.0
    assert items["E-DUE-SOON"]["hours_overdue"] == -2.0
    assert items["E-UNANSWERED-LATE"]["responded"] is False
    assert items["E-URGENT-LATE"]["sku_name"] == "Dining Chair"


def test_items_sorted_most_urgent_first():
    result = get_customer_enquiries(TENANT_ID, as_of=AS_OF)
    assert [i["enquiry_id"] for i in result["items"]] == [
        # immediate: urgent first, then normals by most overdue, then low
        "E-URGENT-LATE",
        "E-UNANSWERED-LATE",
        "E-COMPLAINT-LATE",
        "E-LOW-VERY-LATE",
        "E-NORMAL-LATE",  # overdue
        "E-DUE-SOON",  # due_soon
        "E-RESOLVED-AFTER",  # on_track, normal before low
        "E-ON-TRACK",
    ]


def test_backlog_counts():
    backlog = get_customer_enquiries(TENANT_ID, as_of=AS_OF)["backlog"]
    assert backlog["overdue"] == 5
    assert backlog["immediate"] == 4
    assert backlog["due_soon"] == 1
    assert backlog["unanswered"] == 1
    assert backlog["value_at_stake_sgd"] == 420.0
    assert backlog["by_priority"]["urgent"] == {"open": 1, "overdue": 1}
    assert backlog["by_priority"]["low"] == {"open": 2, "overdue": 1}
    assert list(backlog["by_priority"]) == ["urgent", "normal", "low"]


def test_flow_over_default_24h_window():
    flow = get_customer_enquiries(TENANT_ID, as_of=AS_OF)["flow"]
    # Received in (as_of - 24h, as_of]: E-URGENT-LATE, E-ON-TRACK, E-RESOLVED-IN-SLA.
    assert flow["received"] == 3
    # Resolved in the window: E-RESOLVED-IN-SLA (on time) and E-RESOLVED-LATE (late).
    assert flow["resolved"] == 2
    assert flow["resolved_within_sla"] == 1
    assert flow["sla_hit_rate"] == 0.5
    # First replies of those received: 0.5h, 1h, 1h.
    assert flow["median_first_response_hours"] == 1.0
    assert flow["median_resolution_hours"] == 10.0


def test_as_of_earlier_moment_sees_that_moments_backlog():
    # 3h earlier: E-ON-TRACK doesn't exist yet, E-RESOLVED-LATE is still open (and late).
    earlier = get_customer_enquiries(TENANT_ID, as_of=(ENQ_AS_OF - timedelta(hours=3)).isoformat())
    ids = set(_by_id(earlier))
    assert "E-ON-TRACK" not in ids
    assert _by_id(earlier)["E-RESOLVED-LATE"]["attention"] == "immediate"


def test_limit_caps_items_not_counts():
    result = get_customer_enquiries(TENANT_ID, as_of=AS_OF, limit=2)
    assert len(result["items"]) == 2
    assert result["backlog"]["open"] == 8

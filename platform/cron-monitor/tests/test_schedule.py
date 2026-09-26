from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest

from sage_cron_monitor.schedule import next_boundary, seconds_until

SGT = ZoneInfo("Asia/Singapore")


def test_next_boundary_mid_interval():
    now = datetime(2026, 1, 1, 7, 30, tzinfo=SGT)
    assert next_boundary(now, 6, SGT) == datetime(2026, 1, 1, 12, 0, tzinfo=SGT)


def test_next_boundary_exactly_on_boundary_rolls_to_next():
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=SGT)
    assert next_boundary(now, 6, SGT) == datetime(2026, 1, 1, 18, 0, tzinfo=SGT)


def test_next_boundary_wraps_to_next_day():
    now = datetime(2026, 1, 1, 23, 0, tzinfo=SGT)
    assert next_boundary(now, 6, SGT) == datetime(2026, 1, 2, 0, 0, tzinfo=SGT)


def test_next_boundary_converts_from_utc():
    # 07:30 UTC = 15:30 SGT (+8) -> next boundary 18:00 SGT
    now = datetime(2026, 1, 1, 7, 30, tzinfo=UTC)
    assert next_boundary(now, 6, SGT) == datetime(2026, 1, 1, 18, 0, tzinfo=SGT)


def test_next_boundary_rejects_non_divisor_interval():
    with pytest.raises(ValueError):
        next_boundary(datetime(2026, 1, 1, tzinfo=SGT), 5, SGT)


def test_seconds_until():
    now = datetime(2026, 1, 1, 11, 0, tzinfo=SGT)
    target = datetime(2026, 1, 1, 12, 0, tzinfo=SGT)
    assert seconds_until(now, target) == 3600.0
    assert seconds_until(target, now) == 0.0  # never negative

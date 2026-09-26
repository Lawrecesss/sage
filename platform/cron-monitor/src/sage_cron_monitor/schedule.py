"""When the next check runs.

Boundaries are fixed wall-clock hours in the business timezone (00/06/12/... for a 6h
interval), not "6 hours after whenever the process happened to start" — so a container
restart never drifts the schedule or causes two runs close together.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def next_boundary(now: datetime, interval_hours: int, tz: ZoneInfo) -> datetime:
    """The next local time whose hour is a multiple of `interval_hours` and minute/second/
    microsecond are zero, strictly after `now`. `now` may be naive (UTC) or aware."""
    if interval_hours <= 0 or 24 % interval_hours != 0:
        raise ValueError(f"interval_hours must divide 24, got {interval_hours}")

    local = now.astimezone(tz)
    boundary_hour = (local.hour // interval_hours) * interval_hours
    candidate = local.replace(hour=boundary_hour, minute=0, second=0, microsecond=0)
    while candidate <= local:
        candidate += timedelta(hours=interval_hours)
    return candidate


def seconds_until(now: datetime, target: datetime) -> float:
    return max(0.0, (target - now).total_seconds())

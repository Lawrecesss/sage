"""Builds `dim_date` rows for the run's calendar."""

from __future__ import annotations

from ..config import WEEKDAYS, GeneratorConfig
from ..facts import DateRow

__all__ = ["build_dates"]


def build_dates(config: GeneratorConfig) -> list[DateRow]:
    events = config.events_in_window
    rows: list[DateRow] = []
    for d in config.dates():
        holiday_name = next((e.name for e in events if e.start <= d <= e.end), None)
        rows.append(
            DateRow(
                date=d,
                dow=WEEKDAYS[d.weekday()],
                week=d.isocalendar()[1],
                month=d.month,
                quarter=(d.month - 1) // 3 + 1,
                year=d.year,
                is_holiday=holiday_name is not None,
                holiday_name=holiday_name,
            )
        )
    return rows

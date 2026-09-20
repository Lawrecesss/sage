"""Loads sage's governed metric definitions and runs them against Postgres.

Agents never write raw SQL — `query_metric`/`list_metrics` in server.py are the only
way to reach this data, and they only ever run the exact `sql` template declared for
a given metric id in metrics.yaml. Caller-supplied values are always passed as bound
parameters, never string-interpolated; caller-supplied dimension *names* are checked
against each metric's own allowlist before being used to build a column reference.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml
from sqlalchemy import Engine, create_engine, text

# "supplier" is the human-facing dimension name used throughout metrics.yaml, but
# every table that carries it names the column `supplier_id` — there's no bare
# `supplier` column anywhere in db/schema.py.
_DIMENSION_COLUMN_OVERRIDES = {"supplier": "supplier_id"}


class UnknownMetricError(ValueError):
    """Raised when a metric_id isn't in metrics.yaml."""


class UnsupportedDimensionError(ValueError):
    """Raised when a requested dimension isn't valid, or needs a join query_metric
    doesn't build."""


@dataclass(frozen=True)
class Metric:
    id: str
    label: str
    description: str
    base_table: str
    period_column: str
    sql: str
    grain: list[str]
    dimensions: list[str]
    unit: str
    direction: str
    detectors: list[str]
    owner_domain: str
    joins: dict[str, str] = field(default_factory=dict)
    benchmark: str | None = None

    def native_dimensions(self) -> list[str]:
        """Dimensions filterable without a join — the only ones query_metric supports."""
        return [d for d in self.dimensions if d not in self.joins]

    def summary(self) -> dict:
        """What list_metrics() surfaces to the agent — everything needed to reason
        about the metric, not just compute it."""
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "unit": self.unit,
            "direction": self.direction,
            "benchmark": self.benchmark,
            "grain": self.grain,
            "filterable_dimensions": self.native_dimensions(),
            "owner_domain": self.owner_domain,
        }


def _metrics_path() -> Path:
    return Path(os.environ.get("METRICS_PATH", "metrics.yaml"))


@lru_cache
def load_metrics() -> dict[str, Metric]:
    raw = yaml.safe_load(_metrics_path().read_text(encoding="utf-8"))
    return {entry["id"]: Metric(**entry) for entry in raw}


@lru_cache
def get_engine() -> Engine:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set — can't reach the warehouse.")
    return create_engine(url, pool_pre_ping=True)


def run_metric(
    metric_id: str,
    dimensions: dict[str, str] | None,
    period_start: str,
    period_end: str,
) -> list[dict]:
    """Look up `metric_id`'s definition and run its query, filtered to
    [period_start, period_end] on its period_column plus any given dimension filters.

    Raises UnknownMetricError / UnsupportedDimensionError on bad input — never
    silently ignores a filter it can't apply.
    """
    metric = load_metrics().get(metric_id)
    if metric is None:
        raise UnknownMetricError(f"unknown metric_id: {metric_id!r}")

    dimensions = dimensions or {}
    native = metric.native_dimensions()
    clauses = [f"{metric.period_column} BETWEEN :period_start AND :period_end"]
    params: dict[str, object] = {"period_start": period_start, "period_end": period_end}

    for i, (dim, value) in enumerate(dimensions.items()):
        if dim not in metric.dimensions:
            raise UnsupportedDimensionError(
                f"{metric_id!r} has no {dim!r} dimension; valid dimensions: {metric.dimensions}"
            )
        if dim not in native:
            raise UnsupportedDimensionError(
                f"{dim!r} needs a join query_metric doesn't build for {metric_id!r}; "
                f"filterable without a join: {native}"
            )
        column = _DIMENSION_COLUMN_OVERRIDES.get(dim, dim)
        param_name = f"dim_{i}"
        clauses.append(f"{column} = :{param_name}")
        params[param_name] = value

    sql = metric.sql.format(filters=" AND ".join(clauses))
    with get_engine().connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()
    return [dict(row) for row in rows]

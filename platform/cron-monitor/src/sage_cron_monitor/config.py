from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Config:
    web_url: str
    database_url: str
    interval_hours: int
    timezone: str
    module: str
    run_on_start: bool
    run_once: bool

    @staticmethod
    def from_env() -> Config:
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL is not set")
        return Config(
            web_url=os.environ.get("WEB_URL", "http://web:3000").rstrip("/"),
            database_url=database_url,
            interval_hours=int(os.environ.get("CRON_INTERVAL_HOURS", "6")),
            timezone=os.environ.get("SAGE_TIMEZONE", "Asia/Singapore"),
            module=os.environ.get("CRON_MODULE", "retail"),
            run_on_start=_env_bool("CRON_RUN_ON_START", False),
            run_once=_env_bool("CRON_RUN_ONCE", False),
        )

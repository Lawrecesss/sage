"""sage_cron_monitor — runs the anomaly-monitor report for every active tenant on a fixed
schedule, by calling web's existing POST /api/reports/anomaly-report endpoint.
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import create_engine

from sage_cron_monitor.config import Config
from sage_cron_monitor.runner import run_tick
from sage_cron_monitor.schedule import next_boundary, seconds_until
from sage_cron_monitor.tenants import list_active_tenants

logger = logging.getLogger("sage_cron_monitor")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config = Config.from_env()
    tz = ZoneInfo(config.timezone)
    engine = create_engine(config.database_url, pool_pre_ping=True)

    with httpx.Client() as client:
        if config.run_once:
            logger.info("CRON_RUN_ONCE set: running one tick and exiting")
            run_tick(client, config.web_url, list_active_tenants(engine, config.module))
            return

        if config.run_on_start:
            logger.info("CRON_RUN_ON_START set: running an immediate tick before the schedule")
            run_tick(client, config.web_url, list_active_tenants(engine, config.module))

        logger.info(
            "sage_cron_monitor starting: interval=%dh timezone=%s web_url=%s",
            config.interval_hours,
            config.timezone,
            config.web_url,
        )
        while True:
            now = datetime.now(UTC)
            target = next_boundary(now, config.interval_hours, tz)
            wait = seconds_until(now, target)
            logger.info("next run at %s (in %.0fs)", target.isoformat(), wait)
            time.sleep(wait)
            try:
                run_tick(client, config.web_url, list_active_tenants(engine, config.module))
            except Exception:
                logger.exception("tick failed")

"""One tick: run the anomaly-monitor report for every tenant `tenants.py` returns.

This calls the *existing* report endpoint (`POST /api/reports/anomaly-report` in `web`,
web/src/app/api/reports/[name]/route.ts) exactly like the Reports page's "Generate now"
button would — same agent turn, same tenant scoping (`x-tenant-id`), same persistence
(lib/report-store.ts). This service only supplies the schedule and the tenant list; it
never talks to OpenClaw or Postgres for report data directly.
"""

from __future__ import annotations

import logging
import secrets
import time

import httpx

logger = logging.getLogger("sage_cron_monitor")

REPORT_NAME = "anomaly-report"
# Generous: a report turn calls several retail-mcp tools plus one LLM completion.
REQUEST_TIMEOUT_SECONDS = 600.0


def new_session_id() -> str:
    """Matches web's SESSION_ID rule ([A-Za-z0-9-]{8,64}) — tenant ids aren't embedded
    since they may contain `_`, which that pattern disallows."""
    return f"cron-{secrets.token_hex(8)}"


def run_report(client: httpx.Client, web_url: str, tenant_id: str) -> None:
    session_id = new_session_id()
    started = time.monotonic()
    try:
        resp = client.post(
            f"{web_url}/api/reports/{REPORT_NAME}",
            headers={"x-tenant-id": tenant_id, "content-type": "application/json"},
            json={"sessionId": session_id},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        elapsed = time.monotonic() - started
        if resp.is_success:
            logger.info("tenant=%s session=%s status=%s took=%.1fs ok", tenant_id, session_id, resp.status_code, elapsed)
        else:
            logger.error(
                "tenant=%s session=%s status=%s took=%.1fs body=%s",
                tenant_id,
                session_id,
                resp.status_code,
                elapsed,
                resp.text[:500],
            )
    except httpx.HTTPError as err:
        elapsed = time.monotonic() - started
        logger.error("tenant=%s session=%s took=%.1fs request failed: %s", tenant_id, session_id, elapsed, err)


def run_tick(client: httpx.Client, web_url: str, tenant_ids: list[str]) -> None:
    """Runs every tenant serially so agent turns never overlap on the same OpenClaw/MCP
    replica pool. One tenant failing (network blip, agent unavailable) is logged and
    skipped — never aborts the rest of the tick."""
    logger.info("tick starting: %d tenant(s)", len(tenant_ids))
    for tenant_id in tenant_ids:
        run_report(client, web_url, tenant_id)
    logger.info("tick done")

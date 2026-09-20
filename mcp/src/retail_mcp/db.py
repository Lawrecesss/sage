"""One shared engine/connection pool for this MCP server (ARCHITECTURE.md §3.2:
one pool per service, schema-qualified per request — not one pool per tenant).
"""

from __future__ import annotations

import os
import re
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text

_VALID_TENANT_ID = re.compile(r"^[a-z][a-z0-9_]{0,62}$")


class UnknownTenantError(ValueError):
    """Raised when tenant_id doesn't name an active tenant with this module enabled."""


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set")
    return create_engine(database_url, pool_pre_ping=True)


def assert_tenant_active(conn, tenant_id: str, module: str = "retail") -> None:
    """Validates tenant_id server-side rather than trusting the caller's argument.

    See ARCHITECTURE.md §9: the LLM is instructed to pass tenant_id verbatim,
    but this is the actual enforcement point, not the instruction.
    """
    if not _VALID_TENANT_ID.match(tenant_id):
        raise UnknownTenantError(f"invalid tenant_id: {tenant_id!r}")

    row = conn.execute(
        text(
            """
            SELECT 1
            FROM shared.tenants t
            JOIN shared.tenant_modules m ON m.tenant_id = t.tenant_id
            WHERE t.tenant_id = :tenant_id
              AND t.status = 'active'
              AND m.module_name = :module
              AND m.enabled = true
            """
        ),
        {"tenant_id": tenant_id, "module": module},
    ).first()
    if row is None:
        raise UnknownTenantError(f"unknown or inactive tenant for module {module!r}: {tenant_id!r}")

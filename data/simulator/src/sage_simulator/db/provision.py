"""Provisions a tenant: control-plane rows + its per-tenant Postgres schema.

See ARCHITECTURE.md §3.2. This is the manual, dev-mode version of tenant
provisioning — a real signup pipeline is future work (ARCHITECTURE.md §9).
"""

from __future__ import annotations

import re

from sqlalchemy import Engine, text

from . import schema, shared_schema

__all__ = ["provision_tenant"]

_VALID_TENANT_ID = re.compile(r"^[a-z][a-z0-9_]{0,62}$")


def provision_tenant(engine: Engine, tenant_id: str, modules: list[str]) -> None:
    """Create (or update) a tenant's control-plane rows and Postgres schema.

    Idempotent: safe to call repeatedly for the same tenant_id.
    """
    if not _VALID_TENANT_ID.match(tenant_id):
        raise ValueError(
            f"invalid tenant_id {tenant_id!r}: must match {_VALID_TENANT_ID.pattern} "
            "(it's used as a Postgres schema name)"
        )

    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS shared"))
        shared_schema.metadata.create_all(conn)

        conn.execute(
            text(
                """
                INSERT INTO shared.tenants (tenant_id, name, status)
                VALUES (:tenant_id, :tenant_id, 'active')
                ON CONFLICT (tenant_id) DO NOTHING
                """
            ),
            {"tenant_id": tenant_id},
        )
        for module in modules:
            conn.execute(
                text(
                    """
                    INSERT INTO shared.tenant_modules (tenant_id, module_name, enabled)
                    VALUES (:tenant_id, :module_name, true)
                    ON CONFLICT (tenant_id, module_name) DO UPDATE SET enabled = true
                    """
                ),
                {"tenant_id": tenant_id, "module_name": module},
            )

        # tenant_id is validated above (schema-name-safe) before it's ever
        # interpolated — it can't come from an untrusted request here, but
        # identifiers still can't be bound as query parameters.
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{tenant_id}"'))
        conn.execute(text(f'SET search_path TO "{tenant_id}"'))
        schema.metadata.create_all(conn, checkfirst=True)

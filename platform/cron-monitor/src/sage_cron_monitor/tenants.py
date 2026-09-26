"""Which tenants to check each tick — the same control-plane tables retail-mcp validates
against (ARCHITECTURE.md §3.2), read directly since this service isn't behind that MCP server.
"""

from __future__ import annotations

from sqlalchemy import Engine, text


def list_active_tenants(engine: Engine, module: str = "retail") -> list[str]:
    """Active tenants with `module` enabled, ordered for stable/predictable logging."""
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT t.tenant_id
                FROM shared.tenants t
                JOIN shared.tenant_modules m ON m.tenant_id = t.tenant_id
                WHERE t.status = 'active'
                  AND m.module_name = :module
                  AND m.enabled = true
                ORDER BY t.tenant_id
                """
            ),
            {"module": module},
        )
        return [row[0] for row in rows]

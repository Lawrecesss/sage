"""Control-plane DDL: who exists, what modules they have enabled.

Lives in the `shared` Postgres schema — not tenant business data, so it's
kept separate from `schema.py` (which is per-tenant-schema DDL). See
ARCHITECTURE.md §3.1.
"""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    MetaData,
    String,
    Table,
    func,
)

metadata = MetaData(schema="shared")

tenants = Table(
    "tenants",
    metadata,
    Column("tenant_id", String, primary_key=True),
    Column("name", String, nullable=False),
    Column("status", String, nullable=False, server_default="active"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

tenant_modules = Table(
    "tenant_modules",
    metadata,
    Column("tenant_id", String, ForeignKey("shared.tenants.tenant_id"), primary_key=True),
    Column("module_name", String, primary_key=True),
    Column("enabled", Boolean, nullable=False, server_default="true"),
    Column("config_json", String, nullable=True),
)

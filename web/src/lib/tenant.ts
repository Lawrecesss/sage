// Dev-mode tenant resolution (ARCHITECTURE.md §9 — no real auth yet). Real
// login (JWT/session -> tenant_id) is a documented follow-up, not built here.

import { getPool } from "@/lib/db";

export class UnknownTenantError extends Error {}

export interface ResolvedTenant {
  tenantId: string;
  modules: string[];
}

/** Reads tenant_id from `x-tenant-id`, falling back to DEFAULT_TENANT_ID, and
 * looks up its enabled modules. Throws UnknownTenantError if the tenant is
 * missing or inactive.
 */
export async function resolveTenant(req: Request): Promise<ResolvedTenant> {
  const tenantId = req.headers.get("x-tenant-id")?.trim() || process.env.DEFAULT_TENANT_ID || "demo";

  const { rows: tenantRows } = await getPool().query(
    `SELECT 1 FROM shared.tenants WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId],
  );
  if (tenantRows.length === 0) {
    throw new UnknownTenantError(`unknown or inactive tenant: ${tenantId}`);
  }

  const { rows: moduleRows } = await getPool().query<{ module_name: string }>(
    `SELECT module_name FROM shared.tenant_modules WHERE tenant_id = $1 AND enabled = true`,
    [tenantId],
  );

  return { tenantId, modules: moduleRows.map((r) => r.module_name) };
}

// Dev-mode tenant resolution (ARCHITECTURE.md §9 — no real auth yet). Real
// login (JWT/session -> tenant_id) is a documented follow-up, not built here.

import { headers } from "next/headers";
import { getPool } from "@/lib/db";
import type { ApiError } from "@/lib/types";

export class UnknownTenantError extends Error {}

export interface ResolvedTenant {
  tenantId: string;
  modules: string[];
}

async function resolveTenantById(tenantId: string): Promise<ResolvedTenant> {
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

/** Reads tenant_id from `x-tenant-id`, falling back to DEFAULT_TENANT_ID, and
 * looks up its enabled modules. Throws UnknownTenantError if the tenant is
 * missing or inactive.
 */
export async function resolveTenant(req: Request): Promise<ResolvedTenant> {
  const tenantId = req.headers.get("x-tenant-id")?.trim() || process.env.DEFAULT_TENANT_ID || "demo";
  return resolveTenantById(tenantId);
}

/**
 * Same as `resolveTenant`, but for Server Components/pages, which get a Request
 * object from nowhere — `next/headers` is the page-context equivalent of
 * `req.headers`. Throws UnknownTenantError same as resolveTenant.
 */
export async function resolveTenantForPage(): Promise<ResolvedTenant> {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")?.trim() || process.env.DEFAULT_TENANT_ID || "demo";
  return resolveTenantById(tenantId);
}

/**
 * `resolveTenant`, wrapped for routes that just need a tenant check before serving their own
 * data (not chat/reports) — same 404/502 mapping as agent-response.ts, so an unknown tenant or
 * a down control plane looks identical everywhere in the API.
 */
export async function resolveTenantOrError(req: Request): Promise<{ tenant: ResolvedTenant } | { error: Response }> {
  try {
    return { tenant: await resolveTenant(req) };
  } catch (err) {
    if (err instanceof UnknownTenantError) {
      return { error: Response.json({ error: "unknown tenant" } satisfies ApiError, { status: 404 }) };
    }
    console.error("[tenant] resolution failed", err);
    return { error: Response.json({ error: "tenant lookup unavailable" } satisfies ApiError, { status: 502 }) };
  }
}

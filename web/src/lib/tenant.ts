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

/** Every active tenant with `module` enabled — for work no request asks for (auto-reports.ts). */
export async function listTenantsWithModule(module: string): Promise<ResolvedTenant[]> {
  const { rows } = await getPool().query<{ tenant_id: string; modules: string[] }>(
    `SELECT t.tenant_id, array_agg(m.module_name) AS modules
       FROM shared.tenants t
       JOIN shared.tenant_modules m ON m.tenant_id = t.tenant_id AND m.enabled
      WHERE t.status = 'active'
      GROUP BY t.tenant_id
     HAVING bool_or(m.module_name = $1)`,
    [module],
  );
  return rows.map((r) => ({ tenantId: r.tenant_id, modules: r.modules }));
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
 * Lean page variant: validates the tenant the same way `resolveTenantForPage` does, but skips
 * the `tenant_modules` lookup — every page component so far calls `resolveTenantForPage` only
 * to destructure `tenantId` and discard `.modules` (only agent-response.ts's chat/report routes
 * actually read it), so that second query was a pure-waste round trip on every page navigation.
 * Use this in a page/layout that only needs the id; keep `resolveTenantForPage` for anything
 * that needs enabled modules too.
 */
export async function resolveTenantIdForPage(): Promise<string> {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")?.trim() || process.env.DEFAULT_TENANT_ID || "demo";
  const { rows } = await getPool().query(
    `SELECT 1 FROM shared.tenants WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId],
  );
  if (rows.length === 0) throw new UnknownTenantError(`unknown or inactive tenant: ${tenantId}`);
  return tenantId;
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

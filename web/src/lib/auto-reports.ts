// The scheduled 6-hour report: every tenant with the retail module gets a "six-hour-report"
// (commands.ts) for each 6-hour slot of the business day (00–06, 06–12, 12–18, 18–24 local),
// with the anomaly scan (anomalies.ts) run first, saved to the Reports page like any other.
//
// Started once per server process from instrumentation.ts. Rather than sleeping until the
// next boundary, it checks every CHECK_EVERY_MS whether the last completed slot has a report
// yet, so a restart, a deploy or a slow agent just means the slot is caught up on the next
// check instead of skipped. Running it on several `web` replicas is safe: each slot is claimed
// with a Postgres advisory lock and skipped if already saved.
//
// SAGE_AUTO_REPORTS=off disables it (e.g. a replica that should only serve traffic).

import { generateReport } from "@/lib/agent-response";
import { detectAnomaliesSafe } from "@/lib/anomalies";
import { buildPrompt, findCommand, reportFileMeta } from "@/lib/commands";
import { getPool } from "@/lib/db";
import { hasReportFor } from "@/lib/report-store";
import { type ReportWindow, computeWindow } from "@/lib/report-windows";
import { type ResolvedTenant, listTenantsWithModule } from "@/lib/tenant";

const CHECK_EVERY_MS = 15 * 60_000;
const FIRST_CHECK_MS = 30_000; // let the server finish starting first
/** Wait this long after a slot closes, so the slot's last sales have landed. */
const SETTLE_MS = 5 * 60_000;
/** Attempts per tenant and slot before giving up on it (the agent or the data being down). */
const MAX_ATTEMPTS = 3;

const command = findCommand("six-hour-report")!;
const attempts = new Map<string, number>();
let running = false;

// On globalThis so dev-mode module reloads don't start a second timer.
const state = globalThis as typeof globalThis & { __sageAutoReports?: NodeJS.Timeout };

export function startAutoReports(): void {
  if (state.__sageAutoReports) return;
  if (process.env.SAGE_AUTO_REPORTS === "off") {
    console.log("[auto-reports] disabled (SAGE_AUTO_REPORTS=off)");
    return;
  }
  state.__sageAutoReports = setInterval(check, CHECK_EVERY_MS);
  setTimeout(check, FIRST_CHECK_MS);
  console.log("[auto-reports] scheduled: a 6-hour report per tenant after each slot closes");
}

async function check(): Promise<void> {
  if (running) return; // a slow run is still going; the next check picks up where it left off
  running = true;
  try {
    const now = new Date();
    const window = computeWindow(command.window, now);
    if (now.getTime() - window.end.getTime() < SETTLE_MS) return;
    for (const tenant of await listTenantsWithModule("retail")) {
      await runSlot(tenant, window, now);
    }
  } catch (err) {
    console.error("[auto-reports] check failed", err);
  } finally {
    running = false;
  }
}

async function runSlot(tenant: ResolvedTenant, window: ReportWindow, now: Date): Promise<void> {
  const key = `${command.name}:${tenant.tenantId}:${window.start.toISOString()}`;
  if ((attempts.get(key) ?? 0) >= MAX_ATTEMPTS) return;

  // A session-level lock needs the same connection for lock and unlock, so hold one client.
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtext($1)) AS ok`, [key]);
    if (!rows[0]?.ok) return; // another replica is on it
    try {
      if (await hasReportFor(tenant.tenantId, command.name, window.start)) return;
      attempts.set(key, (attempts.get(key) ?? 0) + 1);
      console.log(`[auto-reports] generating ${key}`);

      const anomalies = await detectAnomaliesSafe(tenant.tenantId, window);
      await generateReport(
        tenant,
        buildPrompt(command, window, now, anomalies),
        `auto-${crypto.randomUUID()}`,
        {
          kind: command.name,
          title: command.title,
          periodStart: window.start,
          periodEnd: window.end,
          partial: false,
          anomalies,
        },
        reportFileMeta(command, window, now),
      );

      if (await hasReportFor(tenant.tenantId, command.name, window.start)) {
        attempts.delete(key);
        console.log(`[auto-reports] saved ${key} (${anomalies.length} anomalies flagged)`);
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [key]);
    }
  } catch (err) {
    console.error(`[auto-reports] ${key} failed`, err);
  } finally {
    client.release();
  }
}

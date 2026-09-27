// The top-bar bell's feed (components/shell/NotificationBell.tsx): every anomaly the pre-report
// scan (lib/anomalies.ts) flagged on the most recent report runs, newest run first and, within a
// run, critical (high-severity) ones first. Derived from the saved reports rather than stored on
// its own, so deleting a report takes its notifications with it and there's nothing to migrate.
// Which ones have been seen is kept in the browser (see NotificationBell) — there are no user
// accounts yet to hang it on.

import { listReports } from "@/lib/data";
import type { AnomalyNotification, Severity } from "@/lib/types";

/** How many recent report runs to read anomalies from, and how many notifications to return. */
const REPORTS = 30;
const MAX_NOTIFICATIONS = 50;

const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export async function listNotifications(tenantId: string): Promise<AnomalyNotification[]> {
  const reports = await listReports(tenantId, REPORTS);
  return reports
    .flatMap((r) =>
      r.anomalies
        .map((a, i): AnomalyNotification => ({
          id: `${r.id}:${i}`,
          critical: a.severity === "high",
          severity: a.severity,
          kind: a.kind,
          summary: a.summary,
          reportId: r.id,
          reportTitle: r.title,
          generatedAt: r.generatedAt,
        }))
        .sort((a, b) => RANK[a.severity] - RANK[b.severity]),
    )
    .slice(0, MAX_NOTIFICATIONS);
}

import { agentResponse, parseReportRequest } from "@/lib/agent-response";
import { detectAnomaliesSafe } from "@/lib/anomalies";
import { buildPrompt, findCommand, reportFileMeta } from "@/lib/commands";
import { computeWindow } from "@/lib/report-windows";
import { resolveTenantOrError } from "@/lib/tenant";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST ReportRequest -> streamed report (ChatResponse) for the report `name`
 * (morning-brief, afternoon-report, evening-report, daily-report, weekly-report, six-hour-report).
 * The anomaly scan (lib/anomalies.ts) runs first; its findings go into the prompt and the saved report.
 */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const command = findCommand(name);
  if (!command) {
    return Response.json({ error: `unknown report: ${name}` } satisfies ApiError, { status: 404 });
  }

  const parsed = parseReportRequest(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json(parsed.error, { status: 400 });

  // agentResponse resolves the tenant again; this one is only so the scan can't run for an
  // unknown tenant (it builds schema-qualified SQL from the id).
  const resolved = await resolveTenantOrError(req);
  if ("error" in resolved) return resolved.error;

  const { sessionId, asOf: asOfIso } = parsed.value;
  const asOf = asOfIso === undefined ? new Date() : new Date(asOfIso);
  const window = computeWindow(command.window, asOf);
  const anomalies = await detectAnomaliesSafe(resolved.tenant.tenantId, window);
  return agentResponse(req, buildPrompt(command, window, asOf, anomalies), sessionId, {
    file: reportFileMeta(command, window, asOf),
    report: {
      kind: command.name,
      title: command.title,
      periodStart: window.start,
      periodEnd: window.partial ? window.through : window.end,
      partial: window.partial,
      anomalies,
    },
  });
}

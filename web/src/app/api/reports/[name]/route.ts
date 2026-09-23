import { agentResponse, parseReportRequest } from "@/lib/agent-response";
import { buildPrompt, findCommand, reportFileMeta } from "@/lib/commands";
import { computeWindow } from "@/lib/report-windows";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST ReportRequest -> streamed report (ChatResponse) for the report `name`
 * (morning-brief, afternoon-report, evening-report, daily-report, weekly-report).
 */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const command = findCommand(name);
  if (!command) {
    return Response.json({ error: `unknown report: ${name}` } satisfies ApiError, { status: 404 });
  }

  const parsed = parseReportRequest(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json(parsed.error, { status: 400 });

  const { sessionId, asOf: asOfIso } = parsed.value;
  const asOf = asOfIso === undefined ? new Date() : new Date(asOfIso);
  const window = computeWindow(command.window, asOf);
  return agentResponse(req, buildPrompt(command, window, asOf), sessionId, {
    file: reportFileMeta(command, window, asOf),
    report: {
      kind: command.name,
      title: command.title,
      periodStart: window.start,
      periodEnd: window.partial ? window.through : window.end,
      partial: window.partial,
    },
  });
}

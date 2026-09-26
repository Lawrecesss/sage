// Report commands ("morning-brief", ...). Each is served by POST /api/reports/<name>, which
// sends the prompt built here to the agent as one ordinary chat turn — no extra MCP tools;
// the agent uses the retail tools it already has (tenant scoping is added in tenant.ts).
//
// The reports follow the usual retail cadence: three dayparts that partition the trading day
// (00–12, 12–18, 18–24, business-local time), then period-close reports (day, week).

import type { ReportFileMeta } from "@/lib/report-file";
import { type ReportWindow, type WindowSpec, formatLocal, localDate } from "@/lib/report-windows";
import type { ReportKind } from "@/lib/types";

export type ReportCommand = {
  name: ReportKind;
  aliases?: string[];
  title: string;
  window: WindowSpec;
  focus: string[];
};

export const COMMANDS: ReportCommand[] = [
  {
    name: "morning-brief",
    aliases: ["morning-report"],
    title: "morning brief (00:00–12:00)",
    window: { kind: "day", startHour: 0, endHour: 12 },
    focus: [
      "Headline: the one thing the owner must act on today.",
      "Trading: revenue, units and refunds against the baseline.",
      "Where it comes from: the biggest movers by channel, category or SKU.",
      "Risks going into the day: sharp drops or rising refunds. Rank the top 3–5 by dollar impact; give each a recommended action.",
    ],
  },
  {
    name: "afternoon-report",
    title: "afternoon report (12:00–18:00)",
    window: { kind: "day", startHour: 12, endHour: 18 },
    focus: [
      "Trading pace: revenue, units and refunds against the baseline — are we on track for the day?",
      "Developing issues: channel or category dips, SKUs falling behind, refunds picking up.",
      "What can still be fixed before close, with a recommended action for each.",
    ],
  },
  {
    name: "evening-report",
    title: "evening report (18:00–24:00)",
    window: { kind: "day", startHour: 18, endHour: 24 },
    focus: [
      "Evening trading (the online peak): revenue, units and channel mix against the baseline.",
      "Refunds and the biggest movers by channel, category or SKU.",
      "What to prepare for tomorrow morning.",
    ],
  },
  {
    name: "daily-report",
    aliases: ["daily-analysis"],
    title: "daily report (00:00–24:00)",
    window: { kind: "day", startHour: 0, endHour: 24 },
    focus: [
      "Scorecard: revenue, units, refunds and refund rate (refunds ÷ revenue) against the baseline.",
      "Top 3 movers and what is driving each (channel, category, SKU or customer segment).",
      "Priorities for tomorrow.",
    ],
  },
  {
    name: "weekly-report",
    title: "weekly report (Monday–Sunday)",
    window: { kind: "week" },
    focus: [
      "Week against the prior week (and the trailing 4-week average, from extra timeseries calls): revenue, units, refunds, refund rate.",
      "Drivers by category, channel and customer segment; separate recurring patterns from one-offs using the daily shape of the week.",
      "Risks and the top 3 priorities for next week.",
    ],
  },
  {
    name: "anomaly-report",
    aliases: ["anomaly-check", "monitor-report"],
    title: "anomaly monitor (automated, every 6h)",
    window: { kind: "rolling", hours: 6 },
    focus: [
      "This reply is the finished report only, not a transcript of your investigation: do every check, cross-check and false-positive verification silently via tool calls first, then write the report once. Never think out loud in the reply, and never lead with what you're about to do.",
      "The very first line of the reply must be the headline verdict and nothing else — e.g. '2 anomalies: SKU stockouts up sharply, receivables overdue' or plainly 'No anomalies detected'. This exact line becomes the report's list-view headline, so it must stand alone as the answer, not a preamble.",
      "First pass: get_attention_items and get_benchmark_gap_analysis across every domain (sales, inventory, suppliers, accounts).",
      "Confirm anything borderline before reporting it: compare_periods (last 7 days vs the prior 7, and today so far vs the same weekday last week), get_stockout_root_causes, get_supplier_performance, get_accounts_status. A generic threshold crossing isn't automatically abnormal for this tenant — check it against their own recent baseline. Discard anything that doesn't hold up; don't mention the false alarm in the reply.",
      "For each real anomaly: which metric, observed value vs baseline/expected, severity, estimated dollar impact, likely domain/cause, and one recommended action.",
      "Rank findings by dollar impact, worst first. This report runs unattended on a fixed schedule — never fabricate a finding to have something to say.",
    ],
  },
];

export function findCommand(name: string): ReportCommand | undefined {
  return COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
}

/** Name and heading of the markdown file attached to the report (see report-file.ts). */
export function reportFileMeta(command: ReportCommand, w: ReportWindow, asOf: Date): ReportFileMeta {
  const period = w.partial
    ? `${formatLocal(w.start)} to ${formatLocal(w.through)} (partial — window still running)`
    : `${formatLocal(w.start)} to ${formatLocal(w.end)}`;
  return {
    name: `${command.name}-${localDate(w.start)}.md`,
    title: command.title.charAt(0).toUpperCase() + command.title.slice(1),
    subtitle: `Period: ${period} · Generated ${formatLocal(asOf)}`,
  };
}

export function buildPrompt(command: ReportCommand, w: ReportWindow, asOf: Date): string {
  // Local time for the reader, UTC ISO for precision.
  const at = (d: Date) => `${formatLocal(d)} [${d.toISOString()}]`;
  return [
    `Run the ${command.title}.`,
    "",
    `Now: ${at(asOf)}`,
    `Reporting window: ${at(w.start)} to ${at(w.end)}`,
    w.partial
      ? `The window is still running: cover it so far (to ${at(w.through)}), say it is partial, and do not extrapolate.`
      : "The window is complete.",
    `Baseline: the same slice one week earlier, ${at(w.baselineStart)} to ${at(w.baselineThrough)} (same weekday, like-for-like).`,
    "",
    "Cover, in this order:",
    ...command.focus.map((f) => `- ${f}`),
    "",
    "Rules:",
    "- Call the retail tools and use only figures they return.",
    "- Sales data is by calendar date only — there is no time-of-day breakdown. Use the window's local dates. For a window shorter than a day, report the whole day's figures, label them full-day, and say plainly that an intraday split isn't available.",
    "- Label every comparison (vs same weekday last week, etc.). If a figure or comparison isn't available from the tools, say so rather than estimating.",
    "- If the tools have nothing inside the window, say that plainly and name the most recent period they do have.",
    "- Where a comparison or trend is clearer as a chart, include one or two (format in your instructions), using only figures the tools returned.",
    "- Lead with the answer. Keep it short; use tables only where they help.",
  ].join("\n");
}

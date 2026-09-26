// Report commands ("morning-brief", ...). Each is served by POST /api/reports/<name>, which
// sends the prompt built here to the agent as one ordinary chat turn — no extra MCP tools;
// the agent uses the retail tools it already has (tenant scoping is added in tenant.ts).
//
// The reports follow the usual retail cadence: three dayparts that partition the trading day
// (00–12, 12–18, 18–24, business-local time), then period-close reports (day, week).

import type { ReportFileMeta } from "@/lib/report-file";
import { type ReportWindow, type WindowSpec, formatLocal, localDate } from "@/lib/report-windows";
import type { Anomaly, ReportKind } from "@/lib/types";

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
    // Not a slash command: lib/auto-reports.ts runs this on its own every 6 hours.
    name: "six-hour-report",
    title: "6-hour report",
    window: { kind: "slot", hours: 6 },
    focus: [
      "Headline: what changed in these 6 hours that the owner should know about.",
      "Trading: revenue, units and refunds against the baseline.",
      "Anomalies: start with any flagged anomalies listed below, then look for any others in the tools' data. For each, say what moved, the likely cause (check stock levels, supplier delays and price changes with the tools) and one recommended action.",
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

/** The anomaly scan's findings as prompt lines — facts for the agent to verify and explain. */
function anomalyLines(anomalies: Anomaly[]): string[] {
  if (anomalies.length === 0) return [];
  const { period, baseline } = anomalies[0];
  const pct = (c: number | null) => (c === null ? "new" : `${c >= 0 ? "+" : ""}${Math.round(c * 100)}%`);
  return [
    "",
    `Flagged anomalies (gross revenue by SKU, ${period.start} to ${period.end} vs ${baseline.start} to ${baseline.end}, computed before this run):`,
    ...anomalies.flatMap((a) => [
      `- [${a.severity}] ${a.summary} — ${a.items
        .map(
          (i) =>
            `${i.name} (${i.sku}): SGD ${i.previous.toFixed(0)} -> ${i.current.toFixed(0)}, ${pct(i.change)}` +
            (i.onHand != null ? `, ${i.onHand} on hand` : "") +
            (i.daysOfCover != null ? ` (~${Math.round(i.daysOfCover)} days cover, ${i.leadTimeDays}-day lead time)` : ""),
        )
        .join("; ")}`,
      ...(a.action ? [`  Suggested action: ${a.action}`] : []),
    ]),
    "Confirm each with the tools before reporting it, and say so if the tools disagree. For an item up while another is down in the same category, consider substitution (one out of stock or repriced). The suggested actions come from simple stock rules: keep, sharpen or replace each one based on what the tools show.",
  ];
}

export function buildPrompt(command: ReportCommand, w: ReportWindow, asOf: Date, anomalies: Anomaly[] = []): string {
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
    ...anomalyLines(anomalies),
    "",
    "End with a section headed exactly `## Recommended actions`: a numbered list of the 3–5 most important things to do next, highest dollar impact first. Each one starts with a verb, names the SKU, channel or supplier it's about, and says in one clause why (the figure behind it).",
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

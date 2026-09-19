// Report commands ("morning-brief", ...). Each is served by POST /api/reports/<name>, which
// sends the prompt built here to the agent as one ordinary chat turn — no extra MCP tools;
// the agent uses the sage tools it already has.
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
      "Trading so far: revenue, orders, average order value and gross margin against the baseline.",
      "Risks going into the day: new or worsening signals, SKUs with low days of cover, supplier deliveries running late.",
      "Cash: invoices due or newly overdue, supplier bills falling due.",
      "Rank the top 3–5 items by estimated dollar impact; give each a recommended action.",
    ],
  },
  {
    name: "afternoon-report",
    title: "afternoon report (12:00–18:00)",
    window: { kind: "day", startHour: 12, endHour: 18 },
    focus: [
      "Trading pace: revenue, orders and average order value against the baseline — are we on track for the day?",
      "Developing issues: SKUs heading for stockout, channel dips, discounting eroding margin, returns picking up.",
      "What can still be fixed before close, with a recommended action for each.",
    ],
  },
  {
    name: "evening-report",
    title: "evening report (18:00–24:00)",
    window: { kind: "day", startHour: 18, endHour: 24 },
    focus: [
      "Evening trading (the online peak): revenue, orders and channel mix against the baseline.",
      "Refunds and returns, fulfilment risks, remaining stock on the top sellers.",
      "What to prepare for tomorrow morning.",
    ],
  },
  {
    name: "daily-report",
    aliases: ["daily-analysis"],
    title: "daily report (00:00–24:00)",
    window: { kind: "day", startHour: 0, endHour: 24 },
    focus: [
      "Scorecard: revenue, gross margin %, orders, average order value and refund rate against the baseline.",
      "Top 3 movers and what is driving each (channel, category, SKU or supplier).",
      "Signals: new, worsening and resolved during the window.",
      "Inventory and cash: stockouts and cover, supplier lead times, receivables/payables ageing.",
      "Priorities for tomorrow.",
    ],
  },
  {
    name: "weekly-report",
    title: "weekly report (Monday–Sunday)",
    window: { kind: "week" },
    focus: [
      "Week against the prior week (and the trailing 4-week average where the tools provide it): revenue, gross margin %, orders, average order value, refund rate.",
      "Drivers by category, channel and supplier; separate recurring issues from one-offs.",
      "Working capital: receivables ageing, payables due, days of cover.",
      "Risks and the top 3 priorities for next week.",
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
  // Local time for the reader, UTC ISO for matching against tool timestamps.
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
    "- Call the sage tools and use only figures they return. Tool timestamps are UTC; match them to the window above.",
    "- Label every comparison (vs same weekday last week, etc.). If a figure or comparison isn't available from the tools, say so rather than estimating.",
    "- If the tools have nothing inside the window, say that plainly and name the most recent period they do have.",
    "- Where a comparison or trend is clearer as a chart, include one or two (format in your instructions), using only figures the tools returned.",
    "- Lead with the answer. Keep it short; use tables only where they help.",
  ].join("\n");
}

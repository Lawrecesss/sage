// Report commands ("morning-brief", ...). Each is served by POST /api/reports/<name>, which
// sends the prompt built here to the agent as one ordinary chat turn — no extra MCP tools;
// the agent uses the retail tools it already has (tenant scoping is added in tenant.ts).
//
// The reports follow the usual retail cadence: three dayparts that partition the trading day
// (00–12, 12–18, 18–24, business-local time), then period-close reports (day, week).

import type { ReportFileMeta } from "@/lib/report-file";
import { type ReportWindow, type WindowSpec, formatLocal, localDate, localTime } from "@/lib/report-windows";
import type { Anomaly, ReportKind } from "@/lib/types";

/** One required section of the report body: rendered as `## {heading}`, with `detail`
 * telling the agent what must go under it — never left for the agent to title itself, so the
 * same command produces the same outline every time it runs. */
export type ReportSection = { heading: string; detail: string };

export type ReportCommand = {
  name: ReportKind;
  aliases?: string[];
  title: string;
  window: WindowSpec;
  /** Plain-English name for the baseline period, used in the prompt's "Baseline: ..." line —
   * e.g. "last night's close" for morning-brief, "the prior week" for weekly-report. Say what
   * the period *is*, not its dates (the exact dates are appended separately). */
  baselineLabel: string;
  /** The metrics that make up the mandatory `## Scorecard` table (see buildPrompt), in the
   * order they must appear as rows — the retail "flash report" standard: actual vs. baseline,
   * every period, no exceptions. */
  scorecardMetrics: string[];
  /** Extra instruction rendered under the scorecard table, for a metric or comparison this
   * command wants beyond the standard actual-vs-baseline row (e.g. a trailing average, a
   * same-day pace check). Omit when the table alone is enough. */
  scorecardNote?: string;
  /** Supporting sections, in the order they must appear — the analysis and evidence for the
   * headline, most material first (see buildPrompt's MECE/ordering rule). The opening one-line
   * summary, the scorecard and the closing `## Recommended actions` are added by `buildPrompt`
   * for every command — don't repeat them here. */
  sections: ReportSection[];
};

export const COMMANDS: ReportCommand[] = [
  {
    name: "morning-brief",
    aliases: ["morning-report"],
    title: "morning brief (00:00–12:00)",
    // Baseline: last night's evening report (18:00–24:00 yesterday) — a 6-hour period against
    // this 12-hour one, so the scorecard note below asks for a per-hour rate too.
    window: { kind: "day", startHour: 0, endHour: 12, baseline: { startHour: 18, endHour: 24, dayOffset: 1 } },
    baselineLabel: "last night's close (yesterday evening's trading)",
    scorecardMetrics: ["revenue", "units", "refunds"],
    scorecardNote:
      "This morning and last night's close cover different numbers of hours, so the raw totals in the table alone would be misleading. Directly below the table (not as an extra table column), add one line: revenue and units per hour for both this morning and last night's close, and say plainly whether this morning is trading faster or slower per hour.",
    sections: [
      { heading: "Drivers", detail: "The biggest movers by channel, category or SKU." },
      {
        heading: "Risks",
        detail:
          "Sharp drops or rising refunds going into the day. Rank the top 3–5 by dollar impact, highest first.",
      },
    ],
  },
  {
    name: "afternoon-report",
    title: "afternoon report (12:00–18:00)",
    // Baseline: this same day's morning brief (00:00–12:00) — a 12-hour period against this
    // 6-hour one, so again a per-hour rate is needed alongside the raw totals.
    window: { kind: "day", startHour: 12, endHour: 18, baseline: { startHour: 0, endHour: 12, dayOffset: 0 } },
    baselineLabel: "this morning's trading",
    scorecardMetrics: ["revenue", "units", "refunds"],
    scorecardNote:
      "This afternoon and this morning cover different numbers of hours, so the raw totals in the table alone would be misleading. Directly below the table (not as an extra table column), add one line: revenue and units per hour for both this afternoon and this morning, and say plainly whether the afternoon's pace is faster or slower per hour.",
    sections: [
      { heading: "Developing issues", detail: "Channel or category dips, SKUs falling behind, refunds picking up." },
      { heading: "Still fixable", detail: "What can still be fixed before close, with a recommended action for each." },
    ],
  },
  {
    name: "evening-report",
    title: "evening report (18:00–24:00)",
    // Baseline: this same day's afternoon report (12:00–18:00) — both 6-hour periods, so
    // totals are directly comparable with no rate normalisation needed.
    window: { kind: "day", startHour: 18, endHour: 24, baseline: { startHour: 12, endHour: 18, dayOffset: 0 } },
    baselineLabel: "this afternoon's trading",
    scorecardMetrics: ["revenue", "units", "refunds"],
    scorecardNote:
      "This afternoon and this evening are both 6-hour periods, so totals are directly comparable — no rate normalisation needed. Also state how channel mix (store vs. online vs. click-and-collect) shifted this evening versus this afternoon.",
    sections: [
      { heading: "Movers", detail: "The biggest movers by channel, category or SKU, beyond the channel-mix shift already noted above." },
      { heading: "Tomorrow", detail: "What to prepare for tomorrow morning." },
    ],
  },
  {
    name: "daily-report",
    aliases: ["daily-analysis"],
    title: "daily report (00:00–24:00)",
    // Baseline: yesterday (the immediately preceding day), not the same weekday last week —
    // day-over-day is the standard for a daily flash report.
    window: { kind: "day", startHour: 0, endHour: 24, baseline: { startHour: 0, endHour: 24, dayOffset: 1 } },
    baselineLabel: "yesterday",
    scorecardMetrics: ["revenue", "units", "refunds", "refund rate (refunds ÷ revenue)"],
    scorecardNote:
      "If today and yesterday fall on different kinds of day (e.g. a weekday vs. a weekend day, or either is a public holiday), say so plainly — it affects how fair this comparison is.",
    sections: [
      {
        heading: "Top movers",
        detail: "The top 3 movers and what is driving each (channel, category, SKU or customer segment).",
      },
      { heading: "Tomorrow", detail: "Priorities for tomorrow." },
    ],
  },
  {
    name: "weekly-report",
    title: "weekly report (Monday–Sunday)",
    window: { kind: "week" },
    baselineLabel: "the prior week",
    scorecardMetrics: ["revenue", "units", "refunds", "refund rate (refunds ÷ revenue)"],
    scorecardNote: "Also include the trailing 4-week average per metric, from extra timeseries calls, as a reference column or note.",
    sections: [
      {
        heading: "Drivers",
        detail:
          "By category, channel and customer segment; separate recurring patterns from one-offs using the daily shape of the week.",
      },
      { heading: "Next week", detail: "Risks and the top 3 priorities for next week." },
    ],
  },
  {
    // Not a slash command: lib/auto-reports.ts runs this on its own every 6 hours.
    name: "six-hour-report",
    title: "6-hour report",
    window: { kind: "slot", hours: 6 },
    baselineLabel: "the same 6-hour slot one week earlier",
    scorecardMetrics: ["revenue", "units", "refunds"],
    sections: [
      {
        heading: "Anomalies",
        detail:
          "Start with any flagged anomalies listed below, then look for any others in the tools' data. For each, say what moved, the likely cause (check stock levels, supplier delays and price changes with the tools) and one recommended action.",
      },
    ],
  },
];

export function findCommand(name: string): ReportCommand | undefined {
  return COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
}

/** Base filename and heading of the PDF/Excel files attached to the report (see report-file.ts). */
export function reportFileMeta(command: ReportCommand, w: ReportWindow, asOf: Date): ReportFileMeta {
  const period = w.partial
    ? `${formatLocal(w.start)} to ${formatLocal(w.through)} (partial — window still running)`
    : `${formatLocal(w.start)} to ${formatLocal(w.end)}`;
  return {
    name: `${command.name}-${localDate(w.start)}`,
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
    "These figures are exact: they come straight from the sales table (gross revenue, refunds excluded). A SKU that a tool result leaves out had zero sales in that period, and a refund is not a sale — never estimate or fill in a figure the tools didn't return.",
    "Confirm each with the tools before reporting it, and say so if the tools disagree. For an item up while another is down in the same category, consider substitution (one out of stock or repriced). The suggested actions come from simple stock rules: keep, sharpen or replace each one based on what the tools show.",
  ];
}

/**
 * Every report's prompt follows the same two standards, applied together:
 *
 * - Retail flash report: a scorecard of actual vs. baseline for the period's core metrics,
 *   every time, no exceptions — never just prose about how sales went.
 * - BI executive summary / pyramid principle: lead with the one governing conclusion, then
 *   supporting evidence ordered most-material-first, each part mutually exclusive (a driver
 *   named once, not repeated across sections) and collectively exhaustive (together they
 *   explain the scorecard — nothing material left unaccounted for).
 *
 * That gives every command the same scaffold — summary line, scorecard, supporting sections,
 * `## Recommended actions` — so the same command produces the same shape every run, and every
 * report in the family reads as one consistent standard. Only the window, the scorecard's
 * metrics/note, the sections' content and (for a sub-day window) the data-availability note
 * below vary by command.
 */
export function buildPrompt(command: ReportCommand, w: ReportWindow, asOf: Date, anomalies: Anomaly[] = []): string {
  // Local time for the reader, UTC ISO for precision.
  const at = (d: Date) => `${formatLocal(d)} [${d.toISOString()}]`;

  // Sales data has no time-of-day breakdown at all (see MCP_TOOLS.md), so any window under 24h
  // can only ever be answered with that calendar day's full figures. Say so once, up front, in
  // an exact sentence the agent copies verbatim — never a paraphrase the model reinvents (and
  // sometimes garbles) on every run.
  const subDay = w.end.getTime() - w.start.getTime() < 24 * 60 * 60 * 1000;
  const dataNote = subDay
    ? `Sales data is by calendar date only, with no time-of-day breakdown available — the figures below are the full day of ${localDate(w.start)}, not limited to ${localTime(w.start)}–${localTime(w.end)}.`
    : undefined;

  return [
    `Run the ${command.title}.`,
    "",
    `Now: ${at(asOf)}`,
    `Reporting window: ${at(w.start)} to ${at(w.end)}`,
    w.partial
      ? `The window is still running: cover it so far (to ${at(w.through)}), say it is partial, and do not extrapolate.`
      : "The window is complete.",
    `Baseline: ${command.baselineLabel}, ${at(w.baselineStart)} to ${at(w.baselineThrough)}.`,
    "",
    "Structure the report exactly as follows, top to bottom, nothing added, removed or reordered:",
    "- Open with one sentence, plain text — no heading, no bullet, no bold — stating the single governing conclusion: the one thing this report is really about, such that a reader who stops after this sentence still has the correct takeaway. This exact sentence is reused elsewhere as the report's summary line, so it must stand on its own. The reader is a store owner/manager, not an analyst — plain language, no jargon.",
    ...(dataNote
      ? [`- Immediately after it, as its own separate paragraph (a blank line before and after, not appended to the summary sentence), include this verbatim — do not paraphrase or reword it: "${dataNote}"`]
      : []),
    "- Then a section headed exactly `## Scorecard`: a Markdown table, one row per metric, columns exactly `Metric | Actual | Baseline | Variance ($) | Variance (%)`, in this metric order: " +
      command.scorecardMetrics.join(", ") +
      ". Actual and Baseline come from the tools for this window and the baseline window above; Variance is Actual minus Baseline. Write every Variance cell with an explicit leading `+` or `-` sign (e.g. `+$1,240`, `-3.2%`) so the direction is unmistakable at a glance, never a bare number.",
    ...(command.scorecardNote ? [`  ${command.scorecardNote}`] : []),
    "- Then these supporting sections, each headed with `##` exactly as written below, in this order: together they must fully explain the scorecard above (nothing material left unaccounted for), each naming a driver, SKU or channel at most once across all of them (no repeats between sections), and any ranked list inside a section goes highest dollar impact first. Wherever a section ranks things by dollar impact (drivers, movers, risks), present that ranking as its own two-column Markdown table — name in column 1, dollar impact in column 2 — instead of a prose list or bullets: it renders as a bar chart automatically, which a store owner scans far faster than a paragraph.",
    ...command.sections.map((s) => `  ## ${s.heading} — ${s.detail}`),
    ...anomalyLines(anomalies),
    "",
    "- End with a section headed exactly `## Recommended actions`: a numbered list of the 3–5 most important things to do next, highest dollar impact first. Each one starts with a verb, names the SKU, channel or supplier it's about, and says in one clause why (the figure behind it).",
    "",
    "Rules:",
    "- Call the retail tools for every figure; never estimate or guess a number.",
    "- Label every comparison explicitly (e.g. \"vs last night's close\", \"vs yesterday\").",
    "- If a figure or comparison a section above asks for isn't available from the tools, say so plainly in that section — never omit it silently or substitute an estimate. In the Scorecard table, write `n/a` in the cell rather than dropping the row.",
    "- If the tools have nothing inside the window, say so plainly and name the most recent period they do have data for.",
    "- This report is read by a store owner/manager, not a developer or analyst: favor tables and charts over paragraphs wherever a comparison or ranking is involved, use plain retail language (no jargon, no metric internals), and make every section skimmable in a few seconds.",
    "- If you show a trend across more than two points in time (e.g. day-by-day across the week, hour-by-hour through the day), use a ```chart line fence for it — the automatic table-to-chart conversion only ever produces bar charts, so a genuine trend needs the fence to render as a line. Otherwise prefer the two-column tables described above over a manual chart fence; use a fence only when a table genuinely can't show the point (e.g. a channel-mix pie). At most two chart fences per report.",
    "- Keep it tight: short sentences, no restating a number you've already given, and no prose that just repeats what the Scorecard table already shows.",
  ].join("\n");
}

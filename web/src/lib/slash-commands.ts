// Slash commands for the Ask chat. Most commands (currently just "explain") expand to a
// prompt and go down the same /api/chat path as a typed message. When OpenClaw skills land
// (openclaw/workspace/skills/*), point `prompt` at the skill instead of inlining it.
//
// "morning-brief" and "daily-report" are report commands: their names must match a
// ReportCommand in lib/commands.ts exactly (checked in parseInput via findCommand), and
// instead of a client-built prompt they dispatch to POST /api/reports/<name> — the same
// tenant-scoped, window-aware report the Reports/Dashboard side runs, not a one-off summary.
// Their `prompt` below is never actually sent (see ParsedInput.prompt) — it only fires if
// findCommand somehow fails to match a name that's right there in the same array, which
// shouldn't happen — so it's generated from commands.ts's own definition (reportPromptFallback)
// rather than hand-written, so it can never silently drift from what the real report asks for.

import { type ReportCommand, findCommand } from "@/lib/commands";

export interface SlashCommand {
  name: string; // without the leading slash
  description: string;
  args?: string; // usage hint, e.g. "<product or SKU>"
  prompt: (arg: string) => string;
}

/** Single source of truth is commands.ts — this just restates that command's own sections as
 * plain prose, so it can never say something the real report (buildPrompt) doesn't also say. */
function reportPromptFallback(name: string): (arg: string) => string {
  return () => {
    const command = findCommand(name) as ReportCommand | undefined;
    if (!command) return `Run the ${name} report.`;
    return [
      `Run the ${command.title}.`,
      `- Scorecard: ${command.scorecardMetrics.join(", ")} vs. baseline.`,
      ...command.sections.map((s) => `- ${s.heading}: ${s.detail}`),
    ].join("\n");
  };
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "morning-brief",
    description: "Trading vs last night's close, today's biggest drivers, and top risks by dollar impact",
    prompt: reportPromptFallback("morning-brief"),
  },
  {
    name: "afternoon-report",
    description: "Afternoon pace vs this morning, developing issues, and what's still fixable before close",
    prompt: reportPromptFallback("afternoon-report"),
  },
  {
    name: "evening-report",
    description: "Evening vs this afternoon, refunds and channel-mix shifts, and what to prep for tomorrow",
    prompt: reportPromptFallback("evening-report"),
  },
  {
    name: "daily-report",
    description: "Today's full-day scorecard vs yesterday, top movers, and priorities for tomorrow",
    prompt: reportPromptFallback("daily-report"),
  },
  {
    name: "weekly-report",
    description: "This week vs last week, top drivers, and priorities for next week",
    prompt: reportPromptFallback("weekly-report"),
  },
  {
    name: "enquiry-report",
    description: "Overdue customer enquiries, the ones needing immediate attention, and what's behind them",
    prompt: reportPromptFallback("enquiry-report"),
  },
  {
    name: "explain",
    description: "Explain an anomaly on one product and its likely cause",
    args: "<product or SKU>",
    prompt: (arg) =>
      `Explain the anomaly on ${arg || "(ask me which product)"}: how its revenue moved over the last 7 days against the 7 days before, the most likely cause (check across domains — sales, inventory, suppliers, accounts), and one recommended action.`,
  },
];

export interface ParsedInput {
  display: string; // what the user sees in their bubble
  prompt: string; // what is sent to the agent (report commands: unused, see reportName)
  command?: SlashCommand;
  /** Set when `command` names a real report — dispatch to POST /api/reports/<reportName>. */
  reportName?: string;
}

/** "/explain sig-001" → expanded prompt. Unknown commands and plain text pass through. */
export function parseInput(raw: string): ParsedInput {
  const text = raw.trim();
  const match = /^\/([a-z-]+)\s*([\s\S]*)$/.exec(text);
  const command = match && SLASH_COMMANDS.find((c) => c.name === match[1]);
  if (!command) return { display: text, prompt: text };
  return {
    display: text,
    prompt: command.prompt(match[2].trim()),
    command,
    reportName: findCommand(command.name)?.name,
  };
}

/** Commands matching a partially typed "/mor…" (only while no space has been typed). */
export function suggestCommands(raw: string): SlashCommand[] {
  if (!raw.startsWith("/") || /\s/.test(raw)) return [];
  const q = raw.slice(1);
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}

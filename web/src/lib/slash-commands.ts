// Slash commands for the Ask chat. Most commands (currently just "explain") expand to a
// prompt and go down the same /api/chat path as a typed message. When OpenClaw skills land
// (openclaw/workspace/skills/*), point `prompt` at the skill instead of inlining it.
//
// "morning-brief" and "daily-report" are report commands: their names must match a
// ReportCommand in lib/commands.ts exactly (checked in parseInput via findCommand), and
// instead of a client-built prompt they dispatch to POST /api/reports/<name> — the same
// tenant-scoped, window-aware report the Reports/Dashboard side runs, not a one-off summary.

import { findCommand } from "@/lib/commands";

export interface SlashCommand {
  name: string; // without the leading slash
  description: string;
  args?: string; // usage hint, e.g. "<signal-id>"
  prompt: (arg: string) => string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "morning-brief",
    description: "Today's top issues, ranked by dollar impact",
    prompt: () =>
      "Give me this morning's brief: the top open signals ranked by dollar impact, what connects them, and one recommended action each.",
  },
  {
    name: "afternoon-report",
    description: "Trading pace so far today, and what's still fixable before close",
    prompt: () =>
      "Give me the afternoon report: trading pace against the baseline, developing issues, and what can still be fixed before close.",
  },
  {
    name: "evening-report",
    description: "Evening trading, refunds, and what to prep for tomorrow",
    prompt: () =>
      "Give me the evening report: evening trading against the baseline, refunds and the biggest movers, and what to prepare for tomorrow morning.",
  },
  {
    name: "daily-report",
    description: "Yesterday's sales, stock and cash in one summary",
    prompt: () =>
      "Summarise yesterday across sales, inventory and accounting: key numbers against normal, and anything unusual.",
  },
  {
    name: "weekly-report",
    description: "This week vs last, top drivers, and priorities for next week",
    prompt: () =>
      "Give me the weekly report: this week against the prior week, the top drivers, and priorities for next week.",
  },
  {
    name: "explain",
    description: "Explain one signal and its likely cause",
    args: "<signal-id>",
    prompt: (arg) =>
      `Explain signal ${arg || "(ask me which one)"}: what moved, by how much against expected, the likely cause across domains, and what to do.`,
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

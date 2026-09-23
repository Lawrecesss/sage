// Slash commands for the Ask chat. A command expands to a prompt and goes down the
// same /api/chat path as a typed message, so chat, dashboard buttons and (later)
// the OpenClaw scheduler share one implementation. When OpenClaw skills land
// (openclaw/workspace/skills/*), point `prompt` at the skill instead of inlining it.

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
    name: "daily-report",
    description: "Yesterday's sales, stock and cash in one summary",
    prompt: () =>
      "Summarise yesterday across sales, inventory and accounting: key numbers against normal, and anything unusual.",
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
  prompt: string; // what is sent to the agent
  command?: SlashCommand;
}

/** "/explain sig-001" → expanded prompt. Unknown commands and plain text pass through. */
export function parseInput(raw: string): ParsedInput {
  const text = raw.trim();
  const match = /^\/([a-z-]+)\s*([\s\S]*)$/.exec(text);
  const command = match && SLASH_COMMANDS.find((c) => c.name === match[1]);
  if (!command) return { display: text, prompt: text };
  return { display: text, prompt: command.prompt(match[2].trim()), command };
}

/** Commands matching a partially typed "/mor…" (only while no space has been typed). */
export function suggestCommands(raw: string): SlashCommand[] {
  if (!raw.startsWith("/") || /\s/.test(raw)) return [];
  const q = raw.slice(1);
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}

// A deliberately small markdown reader for the PDF/Excel exports: headings, bullet/numbered
// lists, GFM pipe tables, horizontal rules, paragraphs and **bold** runs — enough to turn the
// agent's reply into real document structure (real headings, real tables) instead of dumping
// the raw markdown source into a text file. Not a CommonMark implementation; anything fancier
// (nested lists, links, code blocks) falls back to plain paragraph text, which is safe
// (nothing is dropped, just unstyled) — but a GFM table specifically is common enough in
// report replies (scorecards) that leaving it unparsed reads as pipe-and-dash soup, so it gets
// its own node type rather than falling through.

export type InlineRun = { text: string; bold: boolean };
export type TableNode = { type: "table"; header: InlineRun[][]; rows: InlineRun[][][] };
export type MdNode =
  | { type: "heading"; level: 1 | 2 | 3; runs: InlineRun[] }
  | { type: "paragraph"; runs: InlineRun[] }
  | { type: "bullet"; runs: InlineRun[] }
  | { type: "number"; index: number; runs: InlineRun[] }
  | { type: "hr" }
  | TableNode;

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^[-*•]\s+(.*)$/;
const NUMBER_RE = /^(\d+)[.)]\s+(.*)$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const TABLE_SEP_CELL_RE = /^:?-+:?$/;

/** Splits "plain **bold** text" into alternating runs; `*`/`_` emphasis is treated as bold too
 * (the export has no separate italic style). */
export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false });
    runs.push({ text: m[1] ?? m[2] ?? "", bold: true });
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false });
  return runs.filter((r) => r.text !== "");
}

/** Splits one `| a | b |` row into trimmed cell strings, stripping the outer pipes. */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isTableSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => TABLE_SEP_CELL_RE.test(c));
}

/** Parses one markdown block's text into structural nodes, line by line. Blank lines separate
 * paragraphs; a run of list-item lines becomes one node per item; a header row immediately
 * followed by a `|---|---|`-style separator starts a table, consumed until a non-`|` line. */
export function parseMarkdownLite(text: string): MdNode[] {
  const nodes: MdNode[] = [];
  const lines = text.split("\n").map((l) => l.trim());
  let para: string[] = [];

  const flush = () => {
    if (!para.length) return;
    nodes.push({ type: "paragraph", runs: parseInline(para.join(" ").trim()) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      flush();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      nodes.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, runs: parseInline(heading[2]) });
      continue;
    }
    if (line.includes("|") && lines[i + 1] !== undefined && isTableSeparatorRow(lines[i + 1])) {
      flush();
      const header = splitTableRow(line).map(parseInline);
      const rows: InlineRun[][][] = [];
      i += 2; // skip the header row and the separator row just consumed
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]).map(parseInline));
        i++;
      }
      i--; // the for-loop's own i++ accounts for the next line
      nodes.push({ type: "table", header, rows });
      continue;
    }
    if (HR_RE.test(line)) {
      flush();
      nodes.push({ type: "hr" });
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      flush();
      nodes.push({ type: "bullet", runs: parseInline(bullet[1]) });
      continue;
    }
    const numbered = NUMBER_RE.exec(line);
    if (numbered) {
      flush();
      nodes.push({ type: "number", index: Number(numbered[1]), runs: parseInline(numbered[2]) });
      continue;
    }
    para.push(line);
  }
  flush();
  return nodes;
}

/** Plain text of a run list, for contexts (Excel cells, headlines) that don't need bold. */
export function plainText(runs: InlineRun[]): string {
  return runs.map((r) => r.text).join("");
}

function runsToMarkdown(runs: InlineRun[]): string {
  return runs.map((r) => (r.bold ? `**${r.text}**` : r.text)).join("");
}

function tableRowToMarkdown(cells: InlineRun[][]): string {
  return `| ${cells.map((c) => runsToMarkdown(c).replace(/\|/g, "\\|")).join(" | ")} |`;
}

/**
 * Renders parsed nodes back to markdown source — the inverse of parseMarkdownLite. Lets a
 * caller that trimmed a node list (e.g. the Reports page removing the lead paragraph
 * `splitLeadAndBody` already pulled into its own callout) feed what's left back through an
 * existing markdown renderer (react-markdown) instead of hand-building JSX for every node
 * type. Round-trips safely: nothing but **bold** is ever parsed out of the source text in the
 * first place, so anything else (single `*`, backticks, links) survives untouched.
 */
export function stringifyNodes(nodes: MdNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "heading") return `${"#".repeat(node.level)} ${runsToMarkdown(node.runs)}`;
      if (node.type === "paragraph") return runsToMarkdown(node.runs);
      if (node.type === "bullet") return `- ${runsToMarkdown(node.runs)}`;
      if (node.type === "number") return `${node.index}. ${runsToMarkdown(node.runs)}`;
      if (node.type === "hr") return "---";
      const header = tableRowToMarkdown(node.header);
      const sep = `| ${node.header.map(() => "---").join(" | ")} |`;
      return [header, sep, ...node.rows.map(tableRowToMarkdown)].join("\n");
    })
    .join("\n\n");
}

function significantWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** True when a heading's significant words substantially overlap the report title's — good
 * enough to tell "Daily Report — Saturday 26 September 2026" apart from an unrelated section
 * header like "Top 3 Movers", without needing an exact string match (dates/wording vary). */
function sharesTitleWords(heading: string, reportTitle: string): boolean {
  const headingWords = significantWords(heading);
  const titleWords = significantWords(reportTitle);
  if (!headingWords.size || !titleWords.size) return false;
  let shared = 0;
  for (const w of titleWords) if (headingWords.has(w)) shared++;
  return shared >= Math.min(2, titleWords.size);
}

// Matches planning/status narration ("I'll run the daily report...", "Now I need to find...",
// "Good — the data covers today. Now I'll get the breakdowns...") — the kind of between-tool-call
// commentary an agent loop leaves in the reply text. Not anchored to the start of the text:
// these asides sometimes follow a short interjection ("Good — ...") rather than opening the
// paragraph outright. Never matches a genuine analysis sentence ("Revenue fell 31%...", "Refund
// rate held steady...") — those describe what happened, not what the model is about to do.
const NARRATION_RE = /\b(i'll|i will|i'm going to|let me|now i|first,? i|next,? i|i need to|i should)\b/i;
// Capped so it can't reach into a long paragraph that opens with a stray "Now I'll..." but then
// pivots into real analysis — only a short, wholly-narration paragraph gets dropped.
const NARRATION_MAX_LEN = 200;

function isNarration(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= NARRATION_MAX_LEN && NARRATION_RE.test(t);
}

/** Drops every paragraph node that reads as planning narration, wherever it falls — an agent
 * reply can interleave these between report sections, not just at the very start. */
function stripNarration(nodes: MdNode[]): MdNode[] {
  return nodes.filter((n) => n.type !== "paragraph" || !isNarration(plainText(n.runs)));
}

/**
 * Picks the export's "executive summary" callout out of a block's nodes, and returns what's
 * left to render normally (the lead is never rendered twice).
 *
 * Agent replies sometimes carry planning narration ("I'll run the daily report...", "Now I
 * need to find...") — sprinkled between tool calls, not only up front — that's noise, not a
 * summary, so it's stripped first (`stripNarration`) rather than promoted to the callout, or
 * left cluttering the body below. The lead is then the first real analysis sentence:
 * preferably the paragraph right after the first table (that's almost always the sentence
 * explaining the numbers just shown), falling back to the very first paragraph found — which,
 * for the common case of a reply that opens directly with its takeaway, is exactly that
 * opening line.
 *
 * `reportTitle`, when given, is compared against a leading heading (whatever level the model
 * chose — often `##`, not `#`) so a heading that just restates the report's own title (which
 * the export's own document header already shows) is dropped instead of stacking two "titles"
 * back to back. A heading that doesn't share the title's words is left alone — it's a real
 * section header, not a restatement.
 */
export function splitLeadAndBody(nodes: MdNode[], reportTitle?: string): { lead: InlineRun[] | null; rest: MdNode[] } {
  let cleaned = stripNarration(nodes);

  if (cleaned[0]?.type === "heading" && reportTitle && sharesTitleWords(plainText(cleaned[0].runs), reportTitle)) {
    cleaned = cleaned.slice(1);
  }

  const firstTableIdx = cleaned.findIndex((n) => n.type === "table");
  const searchFrom = firstTableIdx === -1 ? 0 : firstTableIdx + 1;
  let leadIdx = cleaned.findIndex((n, i) => i >= searchFrom && n.type === "paragraph");
  if (leadIdx === -1) leadIdx = cleaned.findIndex((n) => n.type === "paragraph");
  if (leadIdx === -1) return { lead: null, rest: cleaned };

  const lead = (cleaned[leadIdx] as Extract<MdNode, { type: "paragraph" }>).runs;
  const rest = [...cleaned.slice(0, leadIdx), ...cleaned.slice(leadIdx + 1)];
  return { lead, rest };
}

// Chart production. The agent has no chart tool — it writes a fenced JSON block into its
// markdown reply and this module turns that into a ChartBlock:
//
//   ```chart
//   {"title":"Revenue by channel","kind":"bar","xKey":"channel",
//    "series":[{"key":"revenue","label":"Revenue"}],"unit":"SGD",
//    "data":[{"channel":"shopee","revenue":18250},{"channel":"lazada","revenue":9100}]}
//   ```
//
// The format is taught to the agent in openclaw/workspace/AGENTS.md. Keep the two in sync.

import type { ChartBlock, ChartKind, DataRow } from "@/lib/types";

const KINDS: ReadonlySet<string> = new Set<ChartKind>(["line", "bar", "area", "pie"]);
const MAX_ROWS = 500;
const MAX_SERIES = 8;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const optionalText = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : undefined);

/** Validates the JSON body of a ```chart fence. Returns null if it isn't a usable chart. */
export function parseChartBlock(raw: string): ChartBlock | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(v) || !isText(v.title) || typeof v.kind !== "string" || !KINDS.has(v.kind) || !isText(v.xKey)) {
    return null;
  }
  const kind = v.kind as ChartKind;
  const xKey = v.xKey;

  if (!Array.isArray(v.series) || v.series.length === 0 || v.series.length > MAX_SERIES) return null;
  if (kind === "pie" && v.series.length !== 1) return null;
  const series: { key: string; label: string }[] = [];
  for (const s of v.series) {
    if (!isObject(s) || !isText(s.key) || !isText(s.label)) return null;
    series.push({ key: s.key, label: s.label });
  }

  if (!Array.isArray(v.data) || v.data.length === 0 || v.data.length > MAX_ROWS) return null;
  const data: DataRow[] = [];
  for (const row of v.data) {
    if (!isObject(row) || !(xKey in row)) return null;
    const clean: DataRow = {};
    for (const [k, cell] of Object.entries(row)) {
      if (cell !== null && typeof cell !== "string" && !(typeof cell === "number" && Number.isFinite(cell))) return null;
      clean[k] = cell;
    }
    data.push(clean);
  }

  return {
    type: "chart",
    title: v.title,
    caption: optionalText(v.caption),
    chart: {
      kind,
      xKey,
      series,
      data,
      unit: optionalText(v.unit),
      xLabel: optionalText(v.xLabel),
      yLabel: optionalText(v.yLabel),
    },
  };
}

/** A chart as a markdown table — for plain-text replies, which can't carry a chart block. */
export function chartToMarkdown({ title, caption, chart }: ChartBlock): string {
  const cell = (v: string | number | null | undefined) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const suffix = chart.unit ? ` (${chart.unit})` : "";
  const header = [chart.xLabel ?? chart.xKey, ...chart.series.map((s) => `${s.label}${suffix}`)];
  const rows = chart.data.map((row) => [row[chart.xKey], ...chart.series.map((s) => row[s.key])]);
  return [
    `**${title}**`,
    "",
    `| ${header.map(cell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
    ...(caption ? ["", `_${caption}_`] : []),
    "",
  ].join("\n");
}

// --- Streaming splitter ---

export type Part = { type: "text"; delta: string } | { type: "chart"; block: ChartBlock };

const OPENER = "```chart";
const OPEN_RE = /(^|\n)```chart[ \t]*\r?\n/g;
const CLOSE_RE = /(^|\n)```[ \t]*\r?\n/;
const CLOSE_AT_END_RE = /(^|\n)```[ \t]*\r?(\n|$)/;

/**
 * Splits a streamed markdown reply into prose and complete charts. Feed it chunks in any
 * split — a fence can straddle chunks — and it emits prose as soon as it is sure the prose
 * isn't the start of a fence, and a chart only once its closing fence arrives. A fence that
 * never closes, or whose JSON isn't a valid chart, is passed through as ordinary text so
 * nothing the agent wrote is lost.
 */
export class ChartSplitter {
  private buf = "";
  private atLineStart = true; // does buf[0] begin a line? (text state only)
  private inChart = false;
  private opener = "";

  push(chunk: string): Part[] {
    this.buf += chunk;
    return this.drain(false);
  }

  end(): Part[] {
    return this.drain(true);
  }

  private drain(final: boolean): Part[] {
    const parts: Part[] = [];
    const text = (delta: string) => delta && parts.push({ type: "text", delta });

    for (;;) {
      if (this.inChart) {
        const m = (final ? CLOSE_AT_END_RE : CLOSE_RE).exec(this.buf);
        if (!m) {
          if (final) {
            text(this.opener + this.buf); // never closed
            this.buf = "";
            this.inChart = false;
          }
          return parts;
        }
        const block = parseChartBlock(this.buf.slice(0, m.index));
        if (block) parts.push({ type: "chart", block });
        else text(this.opener + this.buf.slice(0, m.index + m[0].length));
        this.buf = this.buf.slice(m.index + m[0].length);
        this.inChart = false;
        this.atLineStart = true;
        continue;
      }

      const open = this.findOpener();
      if (open) {
        text(this.buf.slice(0, open.index));
        this.opener = this.buf.slice(open.index, open.index + open.length);
        this.buf = this.buf.slice(open.index + open.length);
        this.inChart = true;
        continue;
      }

      const hold = final ? 0 : this.heldTail();
      const emit = this.buf.slice(0, this.buf.length - hold);
      text(emit);
      this.atLineStart = hold > 0 || (emit ? emit.endsWith("\n") : this.atLineStart);
      this.buf = this.buf.slice(this.buf.length - hold);
      return parts;
    }
  }

  private findOpener(): { index: number; length: number } | null {
    OPEN_RE.lastIndex = 0;
    for (let m = OPEN_RE.exec(this.buf); m; m = OPEN_RE.exec(this.buf)) {
      if (m[1] === "" && !this.atLineStart) continue; // "^" only counts at a real line start
      return { index: m.index + m[1].length, length: m[0].length - m[1].length };
    }
    return null;
  }

  /** Length of a trailing partial line that could still turn into a fence opener. */
  private heldTail(): number {
    const nl = this.buf.lastIndexOf("\n");
    if (nl === -1 && !this.atLineStart) return 0;
    const tail = this.buf.slice(nl + 1);
    return tail !== "" && (OPENER.startsWith(tail) || /^```chart[ \t]*\r?$/.test(tail)) ? tail.length : 0;
  }
}

// A saved report as a PDF, for GET /api/reports/saved/[id]/pdf. Server-side (pdfkit) so the file
// is the same whichever browser asks for it, and so it can be attached or archived as-is.
//
// Layout: a header (title, period, when generated), the anomaly scan's findings, then the
// agent's reply. The reply is markdown, rendered here with a small subset — headings, lists,
// GFM tables, bold/code runs, rules, quotes — which is all the report prompts ask the agent for.
// Charts become tables, the same way the markdown export does it (chartToMarkdown).
//
// pdfkit's built-in fonts only cover Windows-1252, so text is mapped into it first (`clean`).

import PDFDocument from "pdfkit";
import { chartToMarkdown } from "@/lib/chart-blocks";
import { BUSINESS_TZ, formatLocal, localDate } from "@/lib/report-windows";
import type { Anomaly, ContentBlock, Report, Severity, TableBlock } from "@/lib/types";

type Doc = PDFKit.PDFDocument;

const MARGIN = 54;
const FONT = { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique", mono: "Courier" };
const COLOR = { text: "#1c1c1e", muted: "#6b6b70", rule: "#d9d9de", fill: "#f3f3f5", accent: "#2f5bd3" };
const SEVERITY_COLOR: Record<Severity, string> = { high: "#c0362c", medium: "#b26b00", low: "#6b6b70" };

// Windows-1252 has these; anything else outside Latin-1 gets a plain stand-in or is dropped.
const CP1252 = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REPLACE: Record<string, string> = {
  "→": "->", "←": "<-", "↑": "up", "↓": "down", "≥": ">=", "≤": "<=", "≈": "~", "≠": "!=",
  "−": "-", "×": "x", "✓": "yes", "✔": "yes", "✗": "no", "✘": "no", "▲": "up", "▼": "down",
  " ": " ", " ": " ", " ": " ",
};

function clean(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (REPLACE[ch] !== undefined) out += REPLACE[ch];
    else if (code < 0x100 || CP1252.has(ch)) out += ch;
  }
  return out;
}

const bottom = (doc: Doc) => doc.page.height - doc.page.margins.bottom;
const contentWidth = (doc: Doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > bottom(doc)) doc.addPage();
}

// ── Inline runs: **bold**, `code`, *italic*, [text](url) ──────────────────

type Run = { text: string; font: string };
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g;

function runs(text: string, base = FONT.regular): Run[] {
  return clean(text)
    .split(INLINE)
    .filter(Boolean)
    .map((part): Run => {
      if (/^(\*\*|__).+(\*\*|__)$/.test(part)) return { text: part.slice(2, -2), font: FONT.bold };
      if (/^`.+`$/.test(part)) return { text: part.slice(1, -1), font: FONT.mono };
      if (/^\*.+\*$/.test(part)) return { text: part.slice(1, -1), font: FONT.italic };
      const link = /^\[([^\]]+)\]\([^)]+\)$/.exec(part);
      return { text: link ? link[1] : part, font: base };
    });
}

function richText(doc: Doc, text: string, opts: { x: number; width: number; size: number; font?: string; color?: string }) {
  const parts = runs(text, opts.font);
  if (parts.length === 0) return;
  doc.fontSize(opts.size).fillColor(opts.color ?? COLOR.text);
  parts.forEach((run, i) => {
    doc.font(run.font);
    const last = i === parts.length - 1;
    if (i === 0) doc.text(run.text, opts.x, doc.y, { width: opts.width, continued: !last, lineGap: 2 });
    else doc.text(run.text, { continued: !last, lineGap: 2 });
  });
}

const plain = (text: string) => runs(text).map((r) => r.text).join("");

// ── Tables ────────────────────────────────────────────────────────────────

const NUMERIC = /^[-+(]?\s*(SGD|S\$|\$)?\s*[-+]?[\d,]*\.?\d+\s*(%|pp|x|k|m)?\)?$/i;

function table(doc: Doc, rows: string[][]) {
  const cols = Math.max(...rows.map((r) => r.length));
  if (cols === 0) return;
  const x0 = doc.page.margins.left;
  const colWidth = contentWidth(doc) / cols;
  const pad = 4;
  const size = cols > 5 ? 7.5 : 8.5;

  const drawRow = (cells: string[], header: boolean) => {
    doc.fontSize(size).font(header ? FONT.bold : FONT.regular);
    const texts = Array.from({ length: cols }, (_, c) => plain(cells[c] ?? ""));
    const height = Math.max(...texts.map((t) => doc.heightOfString(t || " ", { width: colWidth - pad * 2 }))) + pad * 2;
    ensureSpace(doc, header ? height * 2.5 : height); // never leave a header alone at a page end
    const y = doc.y;
    if (header) doc.rect(x0, y, colWidth * cols, height).fill(COLOR.fill);
    texts.forEach((t, c) => {
      doc
        .fillColor(COLOR.text)
        .font(header ? FONT.bold : FONT.regular)
        .text(t, x0 + c * colWidth + pad, y + pad, {
          width: colWidth - pad * 2,
          align: !header && NUMERIC.test(t.trim()) ? "right" : "left",
        });
    });
    doc
      .moveTo(x0, y + height)
      .lineTo(x0 + colWidth * cols, y + height)
      .lineWidth(0.5)
      .strokeColor(COLOR.rule)
      .stroke();
    doc.x = x0;
    doc.y = y + height;
  };

  rows.forEach((r, i) => drawRow(r, i === 0));
  doc.moveDown(0.6);
}

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));

// ── Markdown ──────────────────────────────────────────────────────────────

function markdown(doc: Doc, text: string) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  // Raw HTML the agent sometimes adds (<details>, <br>): keep a <summary> as a bold line, drop the rest.
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/<summary>(.*?)<\/summary>/gi, "\n**$1**\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      doc.moveDown(0.35);
      continue;
    }

    if (trimmed.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) code.push(lines[i]);
      doc.font(FONT.mono).fontSize(8).fillColor(COLOR.text).text(clean(code.join("\n")), left + 8, doc.y, { width: width - 16 });
      doc.moveDown(0.5);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const size = [16, 13.5, 12, 11, 10.5, 10][heading[1].length - 1];
      ensureSpace(doc, size * 3);
      doc.moveDown(0.4);
      richText(doc, heading[2].replace(/#+$/, ""), { x: left, width, size, font: FONT.bold });
      doc.moveDown(0.3);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      ensureSpace(doc, 12);
      doc.moveDown(0.3);
      doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.5).strokeColor(COLOR.rule).stroke();
      doc.moveDown(0.6);
      continue;
    }

    if (trimmed.startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const rows = [splitRow(trimmed)];
      for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(splitRow(lines[i]));
      i--;
      doc.moveDown(0.2);
      table(doc, rows);
      continue;
    }

    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      const indent = left + 10 + Math.min(Math.floor(item[1].length / 2), 3) * 14;
      const marker = /\d/.test(item[2]) ? item[2] : "•";
      ensureSpace(doc, 14);
      const y = doc.y;
      doc.font(FONT.regular).fontSize(10).fillColor(COLOR.text).text(marker, indent, y, { width: 16 });
      doc.y = y;
      richText(doc, item[3], { x: indent + 16, width: left + width - indent - 16, size: 10 });
      doc.moveDown(0.15);
      continue;
    }

    if (trimmed.startsWith(">")) {
      richText(doc, trimmed.replace(/^>\s?/, ""), { x: left + 12, width: width - 12, size: 10, color: COLOR.muted });
      doc.moveDown(0.2);
      continue;
    }

    // A paragraph: this line and the plain lines straight after it.
    const para = [trimmed];
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(\s*([-*+]|\d+[.)])\s|#|\||>|```)/.test(lines[i + 1].trimStart())) {
      para.push(lines[++i].trim());
    }
    ensureSpace(doc, 14);
    richText(doc, para.join(" "), { x: left, width, size: 10 });
    doc.moveDown(0.4);
  }
}

function tableToMarkdown(block: TableBlock): string {
  const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|");
  const head = block.columns.map((c) => `${c.label}${c.unit ? ` (${c.unit})` : ""}`);
  return [
    ...(block.title ? [`**${block.title}**`, ""] : []),
    `| ${head.map(cell).join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...block.rows.map((r) => `| ${block.columns.map((c) => cell(r[c.key])).join(" | ")} |`),
    "",
  ].join("\n");
}

function blocksToMarkdown(blocks: ContentBlock[]): string {
  return blocks
    .map((b) =>
      b.type === "markdown" ? b.text : b.type === "chart" ? `\n${chartToMarkdown(b)}\n` : b.type === "table" ? `\n${tableToMarkdown(b)}\n` : "",
    )
    .join("");
}

// ── Sections ──────────────────────────────────────────────────────────────

function header(doc: Doc, report: Report) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const title = report.title.charAt(0).toUpperCase() + report.title.slice(1);
  doc.font(FONT.bold).fontSize(9).fillColor(COLOR.accent).text("SAGE REPORT", left, doc.y, { characterSpacing: 1 });
  doc.moveDown(0.3);
  doc.font(FONT.bold).fontSize(20).fillColor(COLOR.text).text(clean(title), { width });
  doc.moveDown(0.3);
  const period = `${formatLocal(new Date(report.periodStart))} to ${formatLocal(new Date(report.periodEnd))}${report.partial ? " (partial)" : ""}`;
  doc
    .font(FONT.regular)
    .fontSize(9)
    .fillColor(COLOR.muted)
    .text(clean(`${title} · ${period}`), { width })
    .text(clean(`Generated ${formatLocal(new Date(report.generatedAt))}`), { width });
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.75).strokeColor(COLOR.rule).stroke();
  doc.moveDown(0.8);
}

function anomalies(doc: Doc, list: Anomaly[]) {
  if (list.length === 0) return;
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const { period, baseline } = list[0];
  const money = (n: number) => `SGD ${Math.round(n).toLocaleString("en-US")}`;
  const pct = (c: number | null) => (c === null ? "new" : `${c >= 0 ? "+" : ""}${Math.round(c * 100)}%`);

  doc.font(FONT.bold).fontSize(13.5).fillColor(COLOR.text).text("Anomalies flagged", left, doc.y, { width });
  doc
    .font(FONT.regular)
    .fontSize(8.5)
    .fillColor(COLOR.muted)
    .text(`Gross revenue by SKU, ${period.start} to ${period.end} vs ${baseline.start} to ${baseline.end}.`, { width });
  doc.moveDown(0.5);

  for (const a of list) {
    ensureSpace(doc, 40);
    const y = doc.y;
    doc.font(FONT.bold).fontSize(7.5).fillColor(SEVERITY_COLOR[a.severity]).text(a.severity.toUpperCase(), left, y, { width: 50 });
    doc.font(FONT.bold).fontSize(10).fillColor(COLOR.text).text(clean(a.summary), left + 52, y - 1, { width: width - 52 });
    for (const it of a.items) {
      const stock = it.onHand == null ? "" : it.onHand <= 0 ? ", out of stock" : `, ${it.onHand} in stock`;
      doc
        .font(FONT.regular)
        .fontSize(8.5)
        .fillColor(COLOR.muted)
        .text(clean(`${it.name} (${it.sku}, ${it.category}): ${money(it.previous)} -> ${money(it.current)}, ${pct(it.change)}${stock}`), left + 52, doc.y, {
          width: width - 52,
        });
    }
    if (a.action) {
      doc.moveDown(0.2);
      doc.font(FONT.bold).fontSize(9).fillColor(COLOR.accent).text("Recommended: ", left + 52, doc.y, { width: width - 52, continued: true });
      doc.font(FONT.regular).fillColor(COLOR.text).text(clean(a.action));
    }
    doc.moveDown(0.5);
  }
  doc.moveDown(0.4);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.5).strokeColor(COLOR.rule).stroke();
  doc.moveDown(0.8);
}

function pageNumbers(doc: Doc) {
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing inside the margin would otherwise add a page
    doc
      .font(FONT.regular)
      .fontSize(8)
      .fillColor(COLOR.muted)
      .text(`Page ${i - start + 1} of ${count}`, doc.page.margins.left, doc.page.height - margin / 2 - 4, {
        width: contentWidth(doc),
        align: "right",
      });
    doc.page.margins.bottom = margin;
  }
}

export function renderReportPdf(report: Report): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: { Title: clean(report.title), Author: "Sage", CreationDate: new Date(report.generatedAt) },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  header(doc, report);
  anomalies(doc, report.anomalies);
  markdown(doc, blocksToMarkdown(report.blocks));
  pageNumbers(doc);
  doc.end();
  return done;
}

/** e.g. "six-hour-report-2026-09-27-0600.pdf" — kind, then the period start in business time. */
export function reportPdfName(report: Report): string {
  const start = new Date(report.periodStart);
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(start)
    .replace(":", "");
  return `${report.kind}-${localDate(start)}-${hhmm}.pdf`;
}

// Renders a report as a formatted PDF: a header, an executive-summary callout, a KPI strip,
// then the report's own sections with real headings/lists, charts drawn as vector graphics
// (via svg-to-pdfkit, from chart-svg.ts), and tables as a styled grid — instead of a literal
// dump of the agent's markdown into a text file.

import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import type { ReportFileMeta } from "@/lib/report-file";
import type { ContentBlock, TableBlock } from "@/lib/types";
import { renderChartSvg } from "./chart-svg";
import type { ReportKpi } from "./kpis";
import { type InlineRun, type MdNode, parseMarkdownLite, plainText } from "./markdown-lite";
import { ACCENT, ACCENT_SOFT, BORDER, NEGATIVE, POSITIVE, SURFACE_MUTED, TEXT, TEXT_MUTED } from "./palette";
import { buildReportView } from "./report-view";

const MARGIN = 48;

/** pdfkit's built-in Helvetica fonts use WinAnsiEncoding, which has no glyph for the Unicode
 * minus sign (U+2212) the agent sometimes writes for a negative delta ("−32%") — left as-is it
 * prints as a stray quote mark instead of a minus. Every other punctuation the agent commonly
 * uses (en/em dash, curly quotes) is already in WinAnsiEncoding and renders fine. */
function pdfSafe(text: string): string {
  return text.replace(/−/g, "-");
}

export async function buildReportPdf(meta: ReportFileMeta, blocks: ContentBlock[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, info: { Title: meta.title } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  writeHeader(doc, meta);

  // Same structure the Reports page renders (report-view.ts): executive summary, KPI strip,
  // an auto-charted visual breakdown, then the body — with any table charted above already
  // removed from it, so the PDF never shows a metric as both a chart and a table.
  const { lead, kpis, autoVisuals, bodyBlocks } = buildReportView(meta.title, blocks);
  if (lead?.length) writeSummaryCallout(doc, lead);
  if (kpis.length) writeKpiStrip(doc, kpis);
  if (autoVisuals.length) {
    doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT).text("Visual breakdown");
    doc.moveDown(0.4);
    for (const visual of autoVisuals) {
      writeChart(doc, visual.title, visual.caption, renderChartSvg(visual.chart, visual.title));
    }
  }

  bodyBlocks.forEach((block) => {
    if (block.type === "file") return;
    if (block.type === "markdown") {
      renderNodes(doc, block.text.trim() ? parseMarkdownLite(block.text) : []);
      return;
    }
    if (block.type === "chart") {
      writeChart(doc, block.title, block.caption, renderChartSvg(block.chart, block.title));
      return;
    }
    if (block.type === "table") writeTable(doc, block);
  });

  writeFooters(doc, meta);
  doc.end();
  return done;
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function writeHeader(doc: PDFKit.PDFDocument, meta: ReportFileMeta): void {
  doc.fontSize(20).font("Helvetica-Bold").fillColor(TEXT).text(meta.title);
  doc.moveDown(0.2);
  doc.fontSize(10.5).font("Helvetica").fillColor(TEXT_MUTED).text(meta.subtitle);
  doc.moveDown(0.4);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor(BORDER)
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.8);
}

function writeSummaryCallout(doc: PDFKit.PDFDocument, lead: InlineRun[]): void {
  const width = contentWidth(doc);
  const pad = 12;
  doc.fontSize(9).font("Helvetica-Bold").fillColor(ACCENT);
  const labelH = doc.heightOfString("EXECUTIVE SUMMARY", { width: width - pad * 2 });
  doc.fontSize(11).font("Helvetica");
  const textH = heightOfRuns(doc, lead, width - pad * 2, 11);
  const boxH = pad * 2 + labelH + 6 + textH;
  ensureSpace(doc, boxH + 16);

  const top = doc.y;
  doc.roundedRect(doc.page.margins.left, top, width, boxH, 6).fill(ACCENT_SOFT);
  doc.fillColor(ACCENT).fontSize(9).font("Helvetica-Bold").text("EXECUTIVE SUMMARY", doc.page.margins.left + pad, top + pad, {
    width: width - pad * 2,
    characterSpacing: 0.4,
  });
  doc.moveDown(0.3);
  writeRuns(doc, lead, { x: doc.page.margins.left + pad, width: width - pad * 2, size: 11, color: TEXT });
  doc.y = top + boxH + 16;
  doc.x = doc.page.margins.left;
}

function heightOfRuns(doc: PDFKit.PDFDocument, runs: InlineRun[], width: number, size: number): number {
  doc.fontSize(size);
  return doc.heightOfString(pdfSafe(runs.map((r) => r.text).join("")), { width });
}

const DELTA_COLOR: Record<NonNullable<ReportKpi["deltaDirection"]>, string> = {
  up: POSITIVE,
  down: NEGATIVE,
  flat: TEXT_MUTED,
};

function writeKpiStrip(doc: PDFKit.PDFDocument, kpis: ReportKpi[]): void {
  const width = contentWidth(doc);
  const perRow = 3;
  const gap = 10;
  const cardW = (width - gap * (perRow - 1)) / perRow;
  const cardH = 62;
  const rows = Math.ceil(kpis.length / perRow);
  ensureSpace(doc, cardH + 12);

  doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT).text("Key metrics");
  doc.moveDown(0.4);

  for (let row = 0; row < rows; row++) {
    ensureSpace(doc, cardH + 8);
    const top = doc.y;
    for (let col = 0; col < perRow; col++) {
      const kpi = kpis[row * perRow + col];
      if (!kpi) continue;
      const x = doc.page.margins.left + col * (cardW + gap);
      doc.roundedRect(x, top, cardW, cardH, 5).fillAndStroke(SURFACE_MUTED, BORDER);
      doc
        .fillColor(TEXT_MUTED)
        .fontSize(8.5)
        .font("Helvetica")
        .text(pdfSafe(kpi.label), x + 10, top + 9, { width: cardW - 20, height: 13, ellipsis: true });
      doc
        .fillColor(TEXT)
        .fontSize(15)
        .font("Helvetica-Bold")
        .text(pdfSafe(kpi.value), x + 10, top + 24, { width: cardW - 20, height: 18, ellipsis: true });
      if (kpi.deltaLabel) {
        doc
          .fillColor(kpi.deltaDirection ? DELTA_COLOR[kpi.deltaDirection] : TEXT_MUTED)
          .fontSize(8.5)
          .font("Helvetica")
          .text(pdfSafe(kpi.deltaLabel), x + 10, top + 44, { width: cardW - 20, height: 13, ellipsis: true });
      }
    }
    doc.y = top + cardH + 8;
  }
  doc.x = doc.page.margins.left;
  doc.moveDown(0.6);
}

const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 15, 2: 13, 3: 11.5 };

function renderNodes(doc: PDFKit.PDFDocument, nodes: MdNode[]): void {
  for (const node of nodes) {
    if (node.type === "heading") {
      ensureSpace(doc, 34);
      doc.moveDown(0.5);
      writeRuns(doc, node.runs, { size: HEADING_SIZE[node.level], forceBold: true, color: TEXT });
      doc.moveDown(0.25);
      continue;
    }
    if (node.type === "paragraph") {
      if (!node.runs.length) continue;
      writeRuns(doc, node.runs, { size: 10.5, color: TEXT });
      doc.moveDown(0.45);
      continue;
    }
    if (node.type === "bullet" || node.type === "number") {
      const prefix = node.type === "bullet" ? "•  " : `${node.index}.  `;
      writeRuns(doc, node.runs, { size: 10.5, color: TEXT, indent: 14, prefix });
      doc.moveDown(0.2);
      continue;
    }
    if (node.type === "hr") {
      ensureSpace(doc, 20);
      doc.moveDown(0.3);
      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor(BORDER)
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.5);
      continue;
    }
    if (node.type === "table") {
      writeGrid(doc, node.header.map(plainText), node.rows.map((row) => row.map(plainText)));
    }
  }
}

function writeRuns(
  doc: PDFKit.PDFDocument,
  runs: InlineRun[],
  opts: { x?: number; width?: number; size: number; color: string; forceBold?: boolean; indent?: number; prefix?: string },
): void {
  const left = opts.x ?? doc.page.margins.left + (opts.indent ?? 0);
  const width = opts.width ?? contentWidth(doc) - (opts.indent ?? 0);
  doc.fontSize(opts.size).fillColor(opts.color);

  const parts = opts.prefix ? [{ text: opts.prefix, bold: false }, ...runs] : runs;
  parts.forEach((r, i) => {
    const isLast = i === parts.length - 1;
    doc.font(opts.forceBold || r.bold ? "Helvetica-Bold" : "Helvetica");
    const text = pdfSafe(r.text);
    if (i === 0) doc.text(text, left, doc.y, { continued: !isLast, width });
    else doc.text(text, { continued: !isLast, width });
  });
}

function writeChart(
  doc: PDFKit.PDFDocument,
  title: string,
  caption: string | undefined,
  rendered: { svg: string; width: number; height: number },
): void {
  const width = contentWidth(doc);
  const scale = width / rendered.width;
  const height = rendered.height * scale;
  const captionH = caption ? 16 : 0;
  ensureSpace(doc, 22 + height + captionH + 20);

  doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT).text(pdfSafe(title));
  doc.moveDown(0.3);
  const top = doc.y;
  SVGtoPDF(doc, rendered.svg, doc.page.margins.left, top, { width, height });
  doc.y = top + height + 6;
  doc.x = doc.page.margins.left;
  if (caption) {
    doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED).text(pdfSafe(caption), { width });
  }
  doc.moveDown(0.8);
}

function writeTable(doc: PDFKit.PDFDocument, block: TableBlock): void {
  const header = block.columns.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label));
  const rows = block.rows.map((row) => block.columns.map((c) => (row[c.key] == null ? "" : String(row[c.key]))));
  writeGrid(doc, header, rows, block.title);
}

/** A bordered, header-shaded data grid — shared by explicit TableBlocks and a parsed GFM
 * markdown table, so both read the same way instead of one looking like plain text. */
function writeGrid(doc: PDFKit.PDFDocument, header: string[], rows: string[][], title?: string): void {
  if (!header.length) return;
  const width = contentWidth(doc);
  const colW = width / header.length;
  const rowH = 20;

  if (title) {
    ensureSpace(doc, 40);
    doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT).text(pdfSafe(title));
    doc.moveDown(0.3);
  }

  ensureSpace(doc, rowH * 2);
  const top0 = doc.y;
  doc.rect(doc.page.margins.left, top0, width, rowH).fill(SURFACE_MUTED);
  doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT);
  header.forEach((label, i) => {
    doc.text(pdfSafe(label), doc.page.margins.left + i * colW + 6, top0 + 6, { width: colW - 12 });
  });
  doc.y = top0 + rowH;
  doc.x = doc.page.margins.left;

  rows.forEach((row, r) => {
    ensureSpace(doc, rowH);
    const top = doc.y;
    if (r % 2 === 1) doc.rect(doc.page.margins.left, top, width, rowH).fill(SURFACE_MUTED);
    doc.fontSize(9).font("Helvetica").fillColor(TEXT);
    row.forEach((cell, i) => {
      doc.text(pdfSafe(cell), doc.page.margins.left + i * colW + 6, top + 6, { width: colW - 12 });
    });
    doc.y = top + rowH;
    doc.x = doc.page.margins.left;
  });
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.margins.left + width, doc.y)
    .strokeColor(BORDER)
    .stroke();
  doc.moveDown(0.8);
}

function writeFooters(doc: PDFKit.PDFDocument, meta: ReportFileMeta): void {
  const range = doc.bufferedPageRange();
  // Footer text sits inside the bottom margin, past `page.height - margins.bottom` — pdfkit's
  // own overflow check would otherwise read that as "doesn't fit" and silently add a blank
  // page per footer written. Lowering margins.bottom to 0 for the write (restored right after)
  // keeps that check from firing.
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - bottomMargin + 18;
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(TEXT_MUTED)
      .text(`${meta.title} · Sage`, doc.page.margins.left, y, { continued: true, width: contentWidth(doc), lineBreak: false })
      .text(`Page ${i - range.start + 1} of ${range.count}`, { align: "right", lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
}

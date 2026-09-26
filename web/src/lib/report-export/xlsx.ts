// Renders a report as an Excel workbook: a Summary sheet (executive summary + KPI table),
// one sheet per chart (the chart as an embedded image, plus its underlying data as a real
// table so it can be sorted/pivoted), one sheet per table block, and a Notes sheet for any
// remaining prose — instead of one markdown-shaped file with everything flattened together.

import { Resvg } from "@resvg/resvg-js";
import ExcelJS from "exceljs";
import type { ReportFileMeta } from "@/lib/report-file";
import type { ChartBlock, ContentBlock, TableBlock } from "@/lib/types";
import { renderChartSvg } from "./chart-svg";
import { deriveKpis, deriveKpisFromTable } from "./kpis";
import { type MdNode, parseMarkdownLite, plainText, splitLeadAndBody, type TableNode } from "./markdown-lite";

const ACCENT = "FF3653D4";
const HEADER_FILL = "FFEFEFEB";
const MUTED_FONT = "FF5C5B56";

function sheetName(existing: Set<string>, base: string): string {
  const cleaned = base.replace(/[*?:\\/[\]]/g, " ").trim().slice(0, 28) || "Sheet";
  let name = cleaned;
  let n = 2;
  while (existing.has(name.toLowerCase())) {
    name = `${cleaned} (${n++})`.slice(0, 31);
  }
  existing.add(name.toLowerCase());
  return name;
}

function chartImagePng(chart: ChartBlock["chart"], title: string): { buffer: Buffer; width: number; height: number } {
  const rendered = renderChartSvg(chart, title);
  const resvg = new Resvg(rendered.svg, { fitTo: { mode: "width", value: rendered.width * 2 } });
  return { buffer: resvg.render().asPng(), width: rendered.width, height: rendered.height };
}

export async function buildReportXlsx(meta: ReportFileMeta, blocks: ContentBlock[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sage";
  wb.created = new Date();

  const names = new Set<string>();
  names.add("summary");
  const summary = wb.addWorksheet("Summary", { properties: { tabColor: { argb: ACCENT } } });

  const leadIdx = blocks.findIndex((b) => b.type === "markdown" && b.text.trim() !== "");
  let leadText = "";
  let leadRest: MdNode[] = [];
  if (leadIdx !== -1) {
    const nodes = parseMarkdownLite((blocks[leadIdx] as { type: "markdown"; text: string }).text);
    const split = splitLeadAndBody(nodes, meta.title);
    leadText = split.lead ? plainText(split.lead) : "";
    leadRest = split.rest;
  }

  // Charts take priority; a plain "Metric | This period | Last period | Change" scorecard
  // table (no chart fence at all) is common enough for these reports to be worth a fallback.
  const firstTableNode = leadRest.find((n): n is TableNode => n.type === "table");
  const chartKpis = deriveKpis(blocks);
  const kpis = chartKpis.length ? chartKpis : firstTableNode ? deriveKpisFromTable(firstTableNode) : [];
  writeSummarySheet(summary, meta, leadText, kpis);

  const notes: MdNode[] = [];
  blocks.forEach((block, i) => {
    if (block.type === "file") return;
    if (block.type === "markdown") {
      const nodes = i === leadIdx ? leadRest : block.text.trim() ? parseMarkdownLite(block.text) : [];
      const { rest, tables } = extractTables(nodes);
      notes.push(...rest);
      for (const { title, table } of tables) {
        const ws = wb.addWorksheet(sheetName(names, title ?? "Table"));
        writeMarkdownTableSheet(ws, table, title);
      }
      return;
    }
    if (block.type === "chart") {
      const ws = wb.addWorksheet(sheetName(names, block.title));
      writeChartSheet(wb, ws, block);
      return;
    }
    if (block.type === "table") {
      const ws = wb.addWorksheet(sheetName(names, block.title ?? "Table"));
      writeTableSheet(ws, block);
    }
  });

  if (notes.length) {
    const ws = wb.addWorksheet("Notes");
    writeNotesSheet(ws, notes);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function writeSummarySheet(
  ws: ExcelJS.Worksheet,
  meta: ReportFileMeta,
  leadText: string,
  kpis: ReturnType<typeof deriveKpis>,
): void {
  ws.columns = [{ width: 26 }, { width: 22 }, { width: 30 }];

  ws.mergeCells("A1:C1");
  ws.getCell("A1").value = meta.title;
  ws.getCell("A1").font = { size: 16, bold: true };

  ws.mergeCells("A2:C2");
  ws.getCell("A2").value = meta.subtitle;
  ws.getCell("A2").font = { size: 10, color: { argb: MUTED_FONT } };

  let row = 4;
  if (leadText) {
    ws.mergeCells(`A${row}:C${row}`);
    ws.getCell(`A${row}`).value = "EXECUTIVE SUMMARY";
    ws.getCell(`A${row}`).font = { size: 9, bold: true, color: { argb: ACCENT } };
    row++;
    ws.mergeCells(`A${row}:C${row + 2}`);
    const cell = ws.getCell(`A${row}`);
    cell.value = leadText;
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.font = { size: 11 };
    row += 4;
  }

  if (kpis.length) {
    row++;
    ws.getCell(`A${row}`).value = "Key metrics";
    ws.getCell(`A${row}`).font = { size: 12, bold: true };
    row++;
    const header = ws.getRow(row);
    header.values = ["Metric", "Value", "Change"];
    header.font = { bold: true };
    header.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    });
    row++;
    for (const kpi of kpis) {
      const r = ws.getRow(row);
      r.values = [kpi.label, kpi.value, kpi.deltaLabel ?? ""];
      row++;
    }
  }
}

function columnsFor(block: ChartBlock): { key: string; label: string }[] {
  return [{ key: block.chart.xKey, label: block.chart.xLabel ?? block.chart.xKey }, ...block.chart.series];
}

function writeChartSheet(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, block: ChartBlock): void {
  ws.getCell("A1").value = block.title;
  ws.getCell("A1").font = { size: 13, bold: true };
  if (block.caption) {
    ws.getCell("A2").value = block.caption;
    ws.getCell("A2").font = { size: 9, italic: true, color: { argb: MUTED_FONT } };
  }

  const { buffer, width, height } = chartImagePng(block.chart, block.title);
  // base64, not `buffer`: exceljs's `Image.buffer` types against the ambient Node `Buffer`
  // global, which a nested @types/node version pulled in by one of its own dependencies
  // (fast-csv) can shadow with an incompatible copy — base64 sidesteps that entirely.
  const imageId = wb.addImage({ base64: `data:image/png;base64,${buffer.toString("base64")}`, extension: "png" });
  ws.addImage(imageId, { tl: { col: 0, row: 3 }, ext: { width, height } });

  const dataStartRow = 4 + Math.ceil(height / 20) + 2;
  const cols = columnsFor(block);
  ws.columns = cols.map((c) => ({ width: 18 }));

  const header = ws.getRow(dataStartRow);
  header.values = cols.map((c) => c.label);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });

  block.chart.data.forEach((row, i) => {
    const r = ws.getRow(dataStartRow + 1 + i);
    r.values = cols.map((c) => row[c.key] ?? null);
  });
}

function writeTableSheet(ws: ExcelJS.Worksheet, block: TableBlock): void {
  ws.columns = block.columns.map((c) => ({ width: 18 }));
  const header = ws.getRow(1);
  header.values = block.columns.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label));
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });

  block.rows.forEach((row, i) => {
    const r = ws.getRow(2 + i);
    r.values = block.columns.map((c) => row[c.key] ?? null);
  });
}

/** Pulls markdown tables out of a node list into their own list (each tagged with the nearest
 * preceding heading, for a sheet title), since a table reads far better as its own sortable
 * sheet than as wrapped text in the Notes sheet. */
function extractTables(nodes: MdNode[]): { rest: MdNode[]; tables: { title: string | undefined; table: TableNode }[] } {
  const rest: MdNode[] = [];
  const tables: { title: string | undefined; table: TableNode }[] = [];
  let lastHeading: string | undefined;
  for (const node of nodes) {
    if (node.type === "heading") lastHeading = plainText(node.runs);
    if (node.type === "table") {
      tables.push({ title: lastHeading, table: node });
      continue;
    }
    rest.push(node);
  }
  return { rest, tables };
}

/** A cell that's purely a number (optionally with thousands separators) becomes a real Excel
 * number so it can be summed/sorted; anything with currency signs, units or a % keeps its
 * original text so the value isn't misrepresented. */
function cellValue(text: string): string | number {
  const t = text.trim();
  if (/^-?[\d,]+(\.\d+)?$/.test(t)) {
    const n = Number(t.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return t;
}

function writeMarkdownTableSheet(ws: ExcelJS.Worksheet, table: TableNode, title?: string): void {
  let startRow = 1;
  if (title) {
    ws.getCell("A1").value = title;
    ws.getCell("A1").font = { size: 13, bold: true };
    startRow = 3;
  }
  ws.columns = table.header.map(() => ({ width: 20 }));
  const header = ws.getRow(startRow);
  header.values = table.header.map(plainText);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });

  table.rows.forEach((row, i) => {
    const r = ws.getRow(startRow + 1 + i);
    r.values = row.map((cell) => cellValue(plainText(cell)));
  });
}

function writeNotesSheet(ws: ExcelJS.Worksheet, nodes: MdNode[]): void {
  ws.columns = [{ width: 100 }];
  let row = 1;
  for (const node of nodes) {
    if (node.type === "hr") {
      row++; // a blank row reads as the section break "---" was marking
      continue;
    }
    const cell = ws.getCell(`A${row}`);
    if (node.type === "heading") {
      cell.value = plainText(node.runs);
      cell.font = { size: node.level === 1 ? 14 : node.level === 2 ? 12.5 : 11.5, bold: true };
    } else if (node.type === "bullet") {
      cell.value = `•  ${plainText(node.runs)}`;
      cell.alignment = { wrapText: true };
    } else if (node.type === "number") {
      cell.value = `${node.index}.  ${plainText(node.runs)}`;
      cell.alignment = { wrapText: true };
    } else if (node.type === "paragraph") {
      cell.value = plainText(node.runs);
      cell.alignment = { wrapText: true };
    }
    row++;
  }
}

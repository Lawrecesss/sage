// Shared structure for a report's "insight" view: executive summary, KPI strip, an auto-
// charted "visual breakdown", and the remaining body — with any table that got turned into one
// of those charts removed from the body so it never also renders as a plain table underneath.
// Both the Reports page (ReportInsights.tsx) and the PDF export (pdf.ts) build off this same
// function, so the on-screen report and its downloadable PDF never disagree about structure —
// and the chat PDF, built from the exact same blocks via buildReportFiles, matches both.

import type { ChartBlock, ContentBlock, MarkdownBlock } from "@/lib/types";
import { deriveKpis, deriveKpisFromTable, type ReportKpi } from "./kpis";
import {
  type InlineRun,
  type MdNode,
  parseMarkdownLite,
  plainText,
  splitLeadAndBody,
  stringifyNodes,
  type TableNode,
} from "./markdown-lite";
import { tableToChartSpec } from "./table-chart";

const MAX_AUTO_VISUALS = 4;

export interface ReportView {
  lead: InlineRun[] | null;
  kpis: ReportKpi[];
  autoVisuals: ChartBlock[];
  /** `blocks`, with the lead paragraph stripped from its markdown block and any table that
   * became an `autoVisuals` chart removed — everything else renders exactly as given. */
  bodyBlocks: ContentBlock[];
}

export function buildReportView(title: string, blocks: ContentBlock[]): ReportView {
  const leadIdx = blocks.findIndex((b): b is MarkdownBlock => b.type === "markdown" && b.text.trim() !== "");

  let lead: InlineRun[] | null = null;
  let firstTableNode: TableNode | undefined;
  let lastHeading: string | undefined;
  let tableCount = 0;
  const autoVisuals: ChartBlock[] = [];

  const bodyBlocks = blocks.map((block, i) => {
    if (block.type !== "markdown" || !block.text.trim()) return block;

    let nodes = parseMarkdownLite(block.text);
    if (i === leadIdx) {
      const split = splitLeadAndBody(nodes, title);
      lead = split.lead;
      nodes = split.rest;
    }

    const kept: MdNode[] = [];
    for (const node of nodes) {
      if (node.type === "heading") {
        lastHeading = plainText(node.runs);
        kept.push(node);
        continue;
      }
      if (node.type !== "table") {
        kept.push(node);
        continue;
      }
      // The very first table in the reply drives the KPI strip (deriveKpisFromTable) — keep it
      // as a real table too, since that's the data backing the summary cards, not a duplicate.
      const isFirst = tableCount === 0;
      tableCount++;
      if (isFirst) {
        firstTableNode = node;
        kept.push(node);
        continue;
      }
      const chart = autoVisuals.length < MAX_AUTO_VISUALS ? tableToChartSpec(node) : null;
      if (chart) {
        autoVisuals.push({ type: "chart", title: lastHeading ?? "Breakdown", chart });
        continue; // charted above — don't also keep the raw table
      }
      kept.push(node);
    }

    return { ...block, text: stringifyNodes(kept) };
  });

  const chartKpis = deriveKpis(blocks);
  const kpis = chartKpis.length ? chartKpis : firstTableNode ? deriveKpisFromTable(firstTableNode) : [];

  return { lead, kpis, autoVisuals, bodyBlocks };
}

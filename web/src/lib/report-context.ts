// A saved report's blocks as plain markdown, for feeding into the agent as chat context — see
// agent-response.ts's `agentResponse` (`reportId` option, wired from the Reports page's
// "Discuss in chat"). Same conventions report-pdf.ts and report-export/*.ts use to flatten a
// report for a static export: charts and tables become markdown tables (chartToMarkdown); a
// file block (the PDF/Excel export itself) carries no useful text and is skipped.

import { chartToMarkdown } from "@/lib/chart-blocks";
import type { Report, TableBlock } from "@/lib/types";

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

export function reportToMarkdown(report: Report): string {
  const body = report.blocks
    .map((b) =>
      b.type === "markdown" ? b.text : b.type === "chart" ? `\n${chartToMarkdown(b)}\n` : b.type === "table" ? `\n${tableToMarkdown(b)}\n` : "",
    )
    .join("");
  return [`# ${report.title}`, body].join("\n\n");
}

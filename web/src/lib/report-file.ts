// The portable file attached at the end of a report: the whole reply as one markdown document
// (charts become tables, so it reads anywhere). Nothing is stored — the file travels inline as
// a `data:` URL, so the browser can download it straight from the message. When report storage
// lands, only `url` changes; the FileRef shape doesn't.

import { chartToMarkdown } from "@/lib/chart-blocks";
import type { ContentBlock, FileRef } from "@/lib/types";

export type ReportFileMeta = {
  /** File name, e.g. "daily-report-2026-09-19.md". */
  name: string;
  /** Document heading. */
  title: string;
  /** One line under the heading: the period covered and when it was generated. */
  subtitle: string;
};

function blocksToMarkdown(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => (b.type === "markdown" ? b.text : b.type === "chart" ? chartToMarkdown(b) : ""))
    .join("");
}

export function buildReportFile(meta: ReportFileMeta, blocks: ContentBlock[]): FileRef {
  const markdown = `# ${meta.title}\n\n_${meta.subtitle}_\n\n${blocksToMarkdown(blocks).trim()}\n`;
  const bytes = Buffer.from(markdown, "utf-8");
  return {
    id: crypto.randomUUID(),
    name: meta.name,
    format: "md",
    mimeType: "text/markdown",
    sizeBytes: bytes.length,
    url: `data:text/markdown;charset=utf-8;base64,${bytes.toString("base64")}`,
  };
}

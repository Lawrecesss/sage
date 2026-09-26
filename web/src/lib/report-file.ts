// The portable files attached at the end of a report: a formatted PDF (read/share/print) and
// an Excel workbook (sort/pivot the underlying numbers) — see lib/report-export/{pdf,xlsx}.ts
// for how each is built from the reply's blocks. Nothing is stored — each file travels inline
// as a `data:` URL, so the browser can download it straight from the message. When report
// storage lands, only `url` changes; the FileRef shape doesn't.

import { buildReportPdf } from "@/lib/report-export/pdf";
import { buildReportXlsx } from "@/lib/report-export/xlsx";
import type { ContentBlock, FileRef } from "@/lib/types";

export type ReportFileMeta = {
  /** File name without extension, e.g. "daily-report-2026-09-19". */
  name: string;
  /** Document heading. */
  title: string;
  /** One line under the heading: the period covered and when it was generated. */
  subtitle: string;
};

function toFileRef(name: string, format: "pdf" | "xlsx", mimeType: string, bytes: Buffer): FileRef {
  return {
    id: crypto.randomUUID(),
    name,
    format,
    mimeType,
    sizeBytes: bytes.length,
    url: `data:${mimeType};base64,${bytes.toString("base64")}`,
  };
}

export async function buildReportFiles(meta: ReportFileMeta, blocks: ContentBlock[]): Promise<FileRef[]> {
  const [pdf, xlsx] = await Promise.all([buildReportPdf(meta, blocks), buildReportXlsx(meta, blocks)]);
  return [
    toFileRef(`${meta.name}.pdf`, "pdf", "application/pdf", pdf),
    toFileRef(
      `${meta.name}.xlsx`,
      "xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xlsx,
    ),
  ];
}

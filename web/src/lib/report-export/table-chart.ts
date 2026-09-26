// Turns a plain "label + one numeric column" markdown table (category revenue, day-of-week
// pattern, channel share, ...) into a bar ChartSpec, so a report that only ever expresses a
// comparison as a table still gets a visual for it — not every reply includes a ```chart
// fence, and a column of numbers is much slower to scan than a bar. Deliberately narrow: skip
// anything with zero or more than one fully-numeric column, since mixing columns on different
// scales (say, dollars and a percent change) into one chart would misrepresent them rather
// than clarify them — that stays a plain table instead.

import type { ChartSpec, DataRow } from "@/lib/types";
import { plainText, type TableNode } from "./markdown-lite";

const MIN_ROWS = 2;
const MAX_ROWS = 12;

function parseNumericCell(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, "").replace(/,/g, "").replace(/%$/, "");
  if (!cleaned || !/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function unitFor(sampleCell: string): string | undefined {
  const t = sampleCell.trim();
  if (t.endsWith("%")) return "pct";
  if (t.startsWith("$")) return "SGD";
  return undefined;
}

/** Null when the table isn't a good bar-chart candidate: too few/many rows, no unambiguous
 * single numeric column, or a blank label. */
export function tableToChartSpec(table: TableNode): ChartSpec | null {
  if (table.header.length < 2) return null;
  if (table.rows.length < MIN_ROWS || table.rows.length > MAX_ROWS) return null;

  const numericCols: number[] = [];
  for (let col = 1; col < table.header.length; col++) {
    if (table.rows.every((row) => parseNumericCell(plainText(row[col] ?? [])) !== null)) numericCols.push(col);
  }
  if (numericCols.length !== 1) return null;
  const col = numericCols[0];

  const data: DataRow[] = [];
  for (const row of table.rows) {
    const label = plainText(row[0] ?? []).trim();
    const value = parseNumericCell(plainText(row[col] ?? []));
    if (!label || value === null) return null;
    data.push({ label, value });
  }

  return {
    kind: "bar",
    xKey: "label",
    series: [{ key: "value", label: plainText(table.header[col]).trim() || "Value" }],
    data,
    unit: unitFor(plainText(table.rows[0][col] ?? [])),
    xLabel: plainText(table.header[0]).trim() || undefined,
  };
}

// Renders one assistant turn's ContentBlock[] (see lib/types.ts) — markdown prose, chart,
// table and file blocks in order. Shared by the chat log and (once it reads real reports)
// the Reports page.
//
// Citations: signal IDs ("sig-001", in prose or code) and metric keys (`gross_revenue`, in
// code spans) render as chips that link to the signal's explain view and the metric page.

import { Download } from "lucide-react";
import { Children, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatChart } from "@/components/chat/ChatChart";
import styles from "@/components/chat/chat.module.css";
import { MetricKey, SignalChip } from "@/components/ui";
import type { ContentBlock } from "@/lib/types";

const SIGNAL_RE = /\b(sig-\d{2,})\b/g;
const SIGNAL_ONLY = /^sig-\d{2,}$/;
const METRIC_ONLY = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Turns bare signal IDs inside plain text children into chips. */
function linkify(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== "string") return child;
    const parts = child.split(SIGNAL_RE);
    if (parts.length === 1) return child;
    return parts.map((part, i) => (i % 2 ? <SignalChip key={i} id={part} /> : part));
  });
}

const components: Components = {
  p: ({ children }) => <p>{linkify(children)}</p>,
  li: ({ children }) => <li>{linkify(children)}</li>,
  td: ({ children }) => <td>{linkify(children)}</td>,
  pre: ({ children }) => <pre>{children}</pre>,
  code: ({ className, children }) => {
    const text = Children.toArray(children).join("");
    const inline = !className && !text.includes("\n");
    if (inline && SIGNAL_ONLY.test(text)) return <SignalChip id={text} />;
    if (inline && METRIC_ONLY.test(text)) return <MetricKey id={text} />;
    return <code className={className}>{children}</code>;
  },
};

export function MessageBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "markdown":
            return block.text ? (
              <div key={i} className={styles.markdown}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                  {block.text}
                </ReactMarkdown>
              </div>
            ) : null;

          case "chart":
            return (
              <figure key={i} className={styles.chartCard}>
                <figcaption className={styles.chartTitle}>{block.title}</figcaption>
                <ChatChart chart={block.chart} title={block.title} />
                {block.caption && <p className={styles.chartCaption}>{block.caption}</p>}
              </figure>
            );

          case "table":
            return (
              <div key={i} className={styles.tableCard}>
                {block.title && <div className={styles.chartTitle}>{block.title}</div>}
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {block.columns.map((c) => (
                          <th key={c.key}>
                            {c.label}
                            {c.unit ? ` (${c.unit})` : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, r) => (
                        <tr key={r}>
                          {block.columns.map((c) => (
                            <td key={c.key} className={typeof row[c.key] === "number" ? styles.numCell : undefined}>
                              {row[c.key] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );

          case "file":
            return (
              <a key={i} className={styles.fileLink} href={block.file.url} download={block.file.name}>
                <Download size={16} strokeWidth={1.75} aria-hidden />
                <span className={styles.fileName}>{block.file.name}</span>
                <span className={styles.fileMeta}>{formatBytes(block.file.sizeBytes)}</span>
              </a>
            );

          default:
            return null;
        }
      })}
    </>
  );
}

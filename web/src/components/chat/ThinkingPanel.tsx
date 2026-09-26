// The "Thinking" panel above a reply: the model's reasoning and the tools it called, in order.
// Open while the reply is being worked out, collapsed to a one-line summary once it's done —
// the user can reopen it. Fed by `thinking` / `step` ChatEvents (lib/types.ts).

import { Brain, Database } from "lucide-react";
import styles from "@/components/chat/chat.module.css";
import type { ThinkingStep } from "@/lib/types";

/** "retail__compare_periods" -> "Compare periods". */
function toolLabel(tool: string): string {
  const name = tool.replace(/^[a-z]+__/, "").replace(/_/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function ThinkingPanel({ steps, live }: { steps: ThinkingStep[]; live: boolean }) {
  if (steps.length === 0) return null;
  const tools = steps.filter((s) => s.kind === "tool").length;
  const summary = live
    ? "Thinking…"
    : `Thought through ${tools} step${tools === 1 ? "" : "s"}`;

  return (
    // `open` follows `live` only when it changes, so once the reply is done the user's own
    // toggling sticks.
    <details className={styles.thinkingPanel} open={live}>
      <summary className={styles.thinkingSummary}>
        <Brain size={14} strokeWidth={2} aria-hidden />
        {summary}
      </summary>
      <ol className={styles.thinkingSteps}>
        {steps.map((s, i) =>
          s.kind === "tool" ? (
            <li key={i} className={styles.thinkingTool}>
              <Database size={13} strokeWidth={2} aria-hidden />
              {toolLabel(s.tool)}
            </li>
          ) : (
            <li key={i} className={styles.thinkingThought}>
              {s.text.trim()}
            </li>
          ),
        )}
      </ol>
    </details>
  );
}

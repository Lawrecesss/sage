"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import shell from "@/components/shell/shell.module.css";
import { buttonClass, EmptyState } from "@/components/ui";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className={shell.page}>
      <EmptyState
        title="Something went wrong"
        icon={TriangleAlert}
        tone="error"
        action={
          <button type="button" onClick={reset} className={buttonClass("secondary")}>
            <RotateCcw size={16} strokeWidth={2} aria-hidden />
            Try again
          </button>
        }
      >
        <p>{error.message || "Sage couldn't load this page."}</p>
      </EmptyState>
    </div>
  );
}

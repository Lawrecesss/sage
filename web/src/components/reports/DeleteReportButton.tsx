"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

/** Deletes a saved report after a confirm. Only router.refresh() — never router.push/replace to
 * the same pathname here: Next's App Router silently drops a same-route, params-only navigation
 * on this page (see ReportsExplorer's header comment), so the list/selection are client state
 * and refresh() just hands them a fresh `all` prop with the deleted report gone; the explorer's
 * existing "fall back to the next report" logic takes it from there. */
export function DeleteReportButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm(`Delete “${title}”? This can’t be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/saved/${encodeURIComponent(id)}`, { method: "DELETE" });
      // 404: already gone (another tab) — the list is what the user wants to see either way.
      if (!res.ok && res.status !== 404) throw new Error(`delete failed: ${res.status}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      window.alert("Couldn’t delete the report. Try again.");
      setBusy(false);
    }
  }

  return (
    <button type="button" className={buttonClass("ghost", "sm")} onClick={onClick} disabled={busy} aria-busy={busy}>
      <Trash2 size={16} strokeWidth={2} aria-hidden />
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}

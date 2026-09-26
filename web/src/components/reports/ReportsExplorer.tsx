"use client";

// The list, filters and selected-report detail are all client-side state, not URL search
// params — clicking a row/chip never calls next/link or router.push. This works around a
// Next.js 15.5 App Router bug: navigating to the same pathname with only the search param
// changing on a force-dynamic page silently no-ops in production (the router's prefetch-cache
// "aliasing" fallback reuses whichever cache entry shares the pathname, ignoring that the
// params differ), so every report/kind-filter click froze instead of switching. Same fix
// already used by the Dashboard's domain tabs (see DashboardView.tsx).
//
// The list itself (`all`) is fetched once, server-side, summaries only — cheap regardless of
// how many reports exist. A report's full body (`blocks`) is fetched lazily, client-side, only
// for whichever one is selected, so switching between reports doesn't refetch or re-render the
// whole page, and picking a report nobody's looked at yet still pays for exactly one row's data.

import { ArrowLeft, LayoutDashboard, MessageSquare, Search, SearchX, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ReportInsights } from "@/components/reports/ReportInsights";
import styles from "@/components/reports/reports.module.css";
import { TopBar } from "@/components/shell/TopBar";
import { Button, ButtonLink, ChipButton, EmptyState, PageSpinner } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Report, ReportKind, ReportSummary } from "@/lib/types";

const KIND_LABEL: Record<ReportKind, string> = {
  "morning-brief": "Morning",
  "afternoon-report": "Afternoon",
  "evening-report": "Evening",
  "daily-report": "Daily",
  "weekly-report": "Weekly",
};
const KINDS = Object.keys(KIND_LABEL) as ReportKind[];

/** Keeps ?report=&kind=&q= in the URL for reloads/shared links, same as Dashboard's ?domain=
 * — a plain history write, never a navigation, so it can't trip the router bug above. */
function syncUrl(next: { report?: string; kind?: ReportKind; q?: string }) {
  const qs = new URLSearchParams();
  if (next.q) qs.set("q", next.q);
  if (next.kind) qs.set("kind", next.kind);
  if (next.report) qs.set("report", next.report);
  const suffix = qs.size ? `?${qs}` : "";
  window.history.replaceState(null, "", `/reports${suffix}`);
}

export function ReportsExplorer({
  all,
  initialReportId,
  initialKind,
  initialQuery,
}: {
  all: ReportSummary[];
  initialReportId?: string;
  initialKind?: ReportKind;
  initialQuery?: string;
}) {
  const [kind, setKind] = useState<ReportKind | undefined>(initialKind);
  const [query, setQuery] = useState(initialQuery ?? "");
  const reports = all.filter(
    (r) =>
      (!kind || r.kind === kind) &&
      (!query || r.title.toLowerCase().includes(query.toLowerCase()) || (r.headline ?? "").toLowerCase().includes(query.toLowerCase())),
  );

  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialReportId && all.some((r) => r.id === initialReportId) ? initialReportId : all[0]?.id,
  );
  const selectedSummary = reports.find((r) => r.id === selectedId) ?? reports[0];
  // Mobile shows one pane at a time; picking a report switches to the detail pane. Separate
  // from `selectedId` (which defaults to the first report even before anyone's picked one) so
  // the list stays the initial view on phones, matching the old ?report=-present-or-not check.
  const [pickedOnMobile, setPickedOnMobile] = useState(Boolean(initialReportId));

  const cache = useRef(new Map<string, Report>());
  const [selected, setSelected] = useState<Report | undefined>(
    selectedSummary && cache.current.get(selectedSummary.id),
  );
  const [detailError, setDetailError] = useState(false);

  useEffect(() => {
    if (!selectedSummary) {
      setSelected(undefined);
      return;
    }
    const cached = cache.current.get(selectedSummary.id);
    if (cached) {
      setSelected(cached);
      setDetailError(false);
      return;
    }
    let cancelled = false;
    setSelected(undefined);
    setDetailError(false);
    fetch(`/api/reports/detail/${selectedSummary.id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((report: Report) => {
        if (cancelled) return;
        cache.current.set(report.id, report);
        setSelected(report);
      })
      .catch(() => {
        if (!cancelled) setDetailError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSummary]);

  const selectKind = (k: ReportKind | undefined) => {
    setKind(k);
    syncUrl({ report: selectedId, kind: k, q: query });
  };
  const selectQuery = (q: string) => {
    setQuery(q);
    syncUrl({ report: selectedId, kind, q });
  };
  const selectReport = (id: string) => {
    setSelectedId(id);
    setPickedOnMobile(true);
    syncUrl({ report: id, kind, q: query });
  };
  const clearFilters = () => {
    setKind(undefined);
    setQuery("");
    syncUrl({ report: selectedId });
  };
  const backToList = () => {
    setPickedOnMobile(false);
  };

  return (
    <>
      <TopBar
        title="Reports"
        subtitle={`${all.length} report${all.length === 1 ? "" : "s"}, newest first`}
        actions={
          <ButtonLink href="/?q=%2Fmorning-brief" icon={Sparkles}>
            Generate now
          </ButtonLink>
        }
      />

      {/* On phones this is one pane at a time: the list, or the report picked from it. */}
      <div className={styles.split} data-picked={pickedOnMobile ? "" : undefined}>
        <div className={styles.list}>
          <div className={styles.tools}>
            <div className={styles.search}>
              <Search size={16} strokeWidth={1.75} className={styles.searchIcon} aria-hidden />
              <input
                className={styles.searchInput}
                type="search"
                value={query}
                onChange={(e) => selectQuery(e.target.value)}
                placeholder="Search reports"
                aria-label="Search reports"
              />
            </div>
            <nav className={styles.filters} aria-label="Filter by report type">
              <ChipButton active={!kind} onClick={() => selectKind(undefined)}>
                All
              </ChipButton>
              {KINDS.map((k) => (
                <ChipButton key={k} active={k === kind} onClick={() => selectKind(k)}>
                  {KIND_LABEL[k]}
                </ChipButton>
              ))}
            </nav>
          </div>

          <ul className={styles.rows}>
            {reports.map((r) => {
              const isSelected = r.id === selectedSummary?.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => selectReport(r.id)}
                    className={isSelected ? styles.rowActive : styles.row}
                    aria-current={isSelected ? "true" : undefined}
                  >
                    <span className={styles.rowTop}>
                      <span className={styles.rowDate}>{formatDateTime(r.generatedAt)}</span>
                      {r.partial && <span className={styles.rowTag}>partial</span>}
                    </span>
                    <span className={styles.rowHeadline}>{r.headline ?? r.title}</span>
                    <span className={styles.rowMeta}>{KIND_LABEL[r.kind]}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {reports.length === 0 && (
            <EmptyState
              title="No reports match"
              icon={SearchX}
              action={
                all.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )
              }
            >
              {all.length === 0 ? "None generated yet. Try “Generate now”." : "Try a different search or report type."}
            </EmptyState>
          )}
        </div>

        <div className={styles.detail}>
          {selectedSummary ? (
            <article className={styles.detailInner}>
              <button type="button" onClick={backToList} className={styles.back}>
                <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                All reports
              </button>

              <header className={styles.detailHead}>
                <div className={styles.detailDate}>
                  {formatDateTime(selectedSummary.periodStart)} – {formatDateTime(selectedSummary.periodEnd)}
                  {selectedSummary.partial ? " · partial" : ""}
                </div>
                <h2 className={styles.headline}>{selectedSummary.headline ?? selectedSummary.title}</h2>
                <div className={styles.detailFoot}>
                  <span className={styles.detailMeta}>
                    {selectedSummary.title} · Generated {formatDateTime(selectedSummary.generatedAt)}
                  </span>
                  <div className={styles.actions}>
                    <ButtonLink
                      href={`/?q=${encodeURIComponent(`Recap the ${selectedSummary.title}`)}`}
                      variant="secondary"
                      icon={MessageSquare}
                      size="sm"
                    >
                      Discuss in chat
                    </ButtonLink>
                    <ButtonLink href="/dashboard" variant="ghost" icon={LayoutDashboard} size="sm">
                      Open dashboard
                    </ButtonLink>
                  </div>
                </div>
              </header>

              <div className={styles.body}>
                {selected ? (
                  <ReportInsights title={selected.title} blocks={selected.blocks} />
                ) : detailError ? (
                  <EmptyState title="Couldn't load this report">Try picking it again.</EmptyState>
                ) : (
                  <PageSpinner label="Loading report…" />
                )}
              </div>
            </article>
          ) : (
            <EmptyState title="No report selected">
              {all.length === 0 ? "Generate one from the chat to see it here." : "Pick a report from the list."}
            </EmptyState>
          )}
        </div>
      </div>
    </>
  );
}

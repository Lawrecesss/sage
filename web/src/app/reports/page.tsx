import { ArrowLeft, LayoutDashboard, MessageSquare, Search, SearchX, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MessageBlocks } from "@/components/chat/MessageBlocks";
import styles from "@/components/reports/reports.module.css";
import { TopBar } from "@/components/shell/TopBar";
import { ButtonLink, ChipLink, EmptyState } from "@/components/ui";
import { getReport, listReports } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { resolveTenantForPage } from "@/lib/tenant";
import type { ReportKind } from "@/lib/types";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<ReportKind, string> = {
  "morning-brief": "Morning",
  "afternoon-report": "Afternoon",
  "evening-report": "Evening",
  "daily-report": "Daily",
  "weekly-report": "Weekly",
  "anomaly-report": "Cron monitor",
};
const KINDS = Object.keys(KIND_LABEL) as ReportKind[];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; kind?: string; q?: string }>;
}) {
  const params = await searchParams;
  const kind = KINDS.find((k) => k === params.kind);
  const query = (params.q ?? "").trim().toLowerCase();

  const { tenantId } = await resolveTenantForPage();
  const all = await listReports(tenantId);
  const reports = all.filter(
    (r) =>
      (!kind || r.kind === kind) &&
      (!query || r.title.toLowerCase().includes(query) || (r.headline ?? "").toLowerCase().includes(query)),
  );
  const selectedSummary = reports.find((r) => r.id === params.report) ?? reports[0] ?? null;
  const selected = selectedSummary ? await getReport(tenantId, selectedSummary.id) : null;

  const href = (next: { report?: string; kind?: string | null }) => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    const k = next.kind === null ? undefined : (next.kind ?? kind);
    if (k) qs.set("kind", k);
    if (next.report) qs.set("report", next.report);
    return `/reports${qs.size ? `?${qs}` : ""}`;
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
      <div className={styles.split} data-picked={params.report ? "" : undefined}>
        <div className={styles.list}>
          <div className={styles.tools}>
            <form className={styles.search} method="get" role="search">
              {kind && <input type="hidden" name="kind" value={kind} />}
              <Search size={16} strokeWidth={1.75} className={styles.searchIcon} aria-hidden />
              <input
                className={styles.searchInput}
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search reports"
                aria-label="Search reports"
              />
            </form>
            <nav className={styles.filters} aria-label="Filter by report type">
              <ChipLink href={href({ kind: null })} active={!kind}>
                All
              </ChipLink>
              {KINDS.map((k) => (
                <ChipLink key={k} href={href({ kind: k })} active={k === kind}>
                  {KIND_LABEL[k]}
                </ChipLink>
              ))}
            </nav>
          </div>

          <ul className={styles.rows}>
            {reports.map((r) => {
              const isSelected = r.id === selectedSummary?.id;
              return (
                <li key={r.id}>
                  <Link
                    href={href({ report: r.id })}
                    className={isSelected ? styles.rowActive : styles.row}
                    aria-current={isSelected ? "true" : undefined}
                    scroll={false}
                  >
                    <span className={styles.rowTop}>
                      <span className={styles.rowDate}>{formatDateTime(r.generatedAt)}</span>
                      {r.partial && <span className={styles.rowTag}>partial</span>}
                    </span>
                    <span className={styles.rowHeadline}>{r.headline ?? r.title}</span>
                    <span className={styles.rowMeta}>{KIND_LABEL[r.kind]}</span>
                  </Link>
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
                  <ButtonLink href="/reports" variant="secondary" size="sm">
                    Clear filters
                  </ButtonLink>
                )
              }
            >
              {all.length === 0 ? "None generated yet. Try “Generate now”." : "Try a different search or report type."}
            </EmptyState>
          )}
        </div>

        <div className={styles.detail}>
          {selected ? (
            <article className={styles.detailInner}>
              <Link href={href({})} className={styles.back} scroll={false}>
                <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                All reports
              </Link>

              <header className={styles.detailHead}>
                <div className={styles.detailDate}>
                  {formatDateTime(selected.periodStart)} – {formatDateTime(selected.periodEnd)}
                  {selected.partial ? " · partial" : ""}
                </div>
                <h2 className={styles.headline}>{selected.headline ?? selected.title}</h2>
                <div className={styles.detailFoot}>
                  <span className={styles.detailMeta}>
                    {selected.title} · Generated {formatDateTime(selected.generatedAt)}
                  </span>
                  <div className={styles.actions}>
                    <ButtonLink
                      href={`/?q=${encodeURIComponent(`Recap the ${selected.title}`)}`}
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
                <MessageBlocks blocks={selected.blocks} />
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

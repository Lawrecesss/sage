import type { Metadata } from "next";
import Link from "next/link";
import { MessageBlocks } from "@/components/chat/MessageBlocks";
import styles from "@/components/history/history.module.css";
import { TopBar } from "@/components/shell/TopBar";
import { ButtonLink, ChipLink, EmptyState } from "@/components/ui";
import { getReport, listReports } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { resolveTenantForPage } from "@/lib/tenant";
import type { ReportKind } from "@/lib/types";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<ReportKind, string> = {
  "morning-brief": "Morning",
  "afternoon-report": "Afternoon",
  "evening-report": "Evening",
  "daily-report": "Daily",
  "weekly-report": "Weekly",
};
const KINDS = Object.keys(KIND_LABEL) as ReportKind[];

export default async function HistoryPage({
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

  const href = (next: { report?: string; kind?: string }) => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    const k = next.kind ?? kind;
    if (k) qs.set("kind", k);
    if (next.report) qs.set("report", next.report);
    return `/history${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <TopBar
        title="History"
        subtitle={`${all.length} report${all.length === 1 ? "" : "s"} · newest first`}
        actions={<ButtonLink href="/?q=%2Fmorning-brief">Generate now</ButtonLink>}
      />

      <div className={styles.split}>
        <div className={styles.list}>
          <div className={styles.tools}>
            <form className={styles.search} method="get">
              {kind && <input type="hidden" name="kind" value={kind} />}
              <input
                className={styles.searchInput}
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search reports…"
                aria-label="Search reports"
              />
            </form>
            <div className={styles.filters}>
              <ChipLink href={href({ kind: undefined })} active={!kind}>
                All
              </ChipLink>
              {KINDS.map((k) => (
                <ChipLink key={k} href={href({ kind: k })} active={k === kind}>
                  {KIND_LABEL[k]}
                </ChipLink>
              ))}
            </div>
          </div>

          {reports.map((r) => (
            <Link
              key={r.id}
              href={href({ report: r.id })}
              className={r.id === selectedSummary?.id ? styles.rowActive : styles.row}
            >
              <div className={styles.rowTop}>
                <span className={styles.rowDate}>{formatDateTime(r.generatedAt)}</span>
                {r.partial && <span className={styles.rowTag}>partial</span>}
              </div>
              <span className={styles.rowHeadline}>{r.headline ?? r.title}</span>
              <span className={styles.rowMeta}>{KIND_LABEL[r.kind]}</span>
            </Link>
          ))}

          {reports.length === 0 && (
            <div style={{ padding: 16 }}>
              <EmptyState title="No reports match">
                {all.length === 0 ? "None generated yet — try “Generate now”." : "Try clearing the search or filter."}
              </EmptyState>
            </div>
          )}
        </div>

        <div className={styles.detail}>
          {selected ? (
            <>
              <div className={styles.detailHead}>
                <div>
                  <div className={styles.detailDate}>{selected.title}</div>
                  <div className={styles.detailMeta}>
                    {formatDateTime(selected.periodStart)} – {formatDateTime(selected.periodEnd)}
                    {selected.partial ? " · partial" : ""} · generated {formatDateTime(selected.generatedAt)}
                  </div>
                </div>
                <div className={styles.actions}>
                  <ButtonLink href={`/?q=${encodeURIComponent(`Recap the ${selected.title}`)}`} variant="ghost">
                    Discuss in chat
                  </ButtonLink>
                  <ButtonLink href="/dashboard">Open dashboard</ButtonLink>
                </div>
              </div>

              <MessageBlocks blocks={selected.blocks} />
            </>
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

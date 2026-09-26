import { ArrowLeft, LayoutDashboard, MessageSquare, SearchX, Sparkles, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BriefItemCard } from "@/components/brief/BriefItemCard";
import { KpiStrip } from "@/components/brief/KpiStrip";
import styles from "@/components/history/history.module.css";
import { TopBar } from "@/components/shell/TopBar";
import { ButtonLink, DomainMark, EmptyState, SegmentedLinks } from "@/components/ui";
import { listBriefs } from "@/lib/data";
import { formatDate, formatDateTime, formatImpact, formatShortDate } from "@/lib/format";
import type { Brief, Domain } from "@/lib/types";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

const DOMAINS: Domain[] = ["sales", "inventory", "accounting"];
const LABEL: Record<Domain, string> = { sales: "Sales", inventory: "Inventory", accounting: "Accounting" };

const impactOf = (b: Brief) => b.items.reduce((sum, i) => sum + i.dollar_impact_est, 0);
const domainsOf = (b: Brief) => [...new Set(b.items.map((i) => i.domain))];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ brief?: string; domain?: string; q?: string }>;
}) {
  const params = await searchParams;
  const domain = DOMAINS.find((d) => d === params.domain);
  const query = (params.q ?? "").trim().toLowerCase();

  const all = await listBriefs();
  const briefs = all.filter(
    (b) =>
      (!domain || domainsOf(b).includes(domain)) &&
      (!query ||
        b.headline.toLowerCase().includes(query) ||
        b.items.some((i) => i.title.toLowerCase().includes(query))),
  );
  const selected = briefs.find((b) => b.brief_id === params.brief) ?? briefs[0] ?? null;
  const issues = selected
    ? [...selected.items].sort((a, b) => Math.abs(b.dollar_impact_est) - Math.abs(a.dollar_impact_est) || a.rank - b.rank)
    : [];

  const href = (next: { brief?: string; domain?: string | null }) => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    const d = next.domain === null ? undefined : (next.domain ?? domain);
    if (d) qs.set("domain", d);
    if (next.brief) qs.set("brief", next.brief);
    return `/history${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <TopBar
        title="History"
        subtitle={`${all.length} daily briefs, newest first`}
        actions={
          <ButtonLink href="/?q=%2Fmorning-brief" icon={Sparkles}>
            Generate now
          </ButtonLink>
        }
      />

      {/* On phones this is one pane at a time: the list, or the brief picked from it. */}
      <div className={styles.split} data-picked={params.brief ? "" : undefined}>
        <div className={styles.list}>
          <div className={styles.tools}>
            <form className={styles.search} method="get" role="search">
              {domain && <input type="hidden" name="domain" value={domain} />}
              <Search size={16} strokeWidth={1.75} className={styles.searchIcon} aria-hidden />
              <input
                className={styles.searchInput}
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search briefs"
                aria-label="Search briefs"
              />
            </form>
            <SegmentedLinks
              label="Filter by domain"
              stretch
              items={[
                { href: href({ domain: null }), label: "All", active: !domain },
                ...DOMAINS.map((d) => ({ href: href({ domain: d }), label: LABEL[d], active: d === domain })),
              ]}
            />
          </div>

          <ul className={styles.rows}>
            {briefs.map((b) => {
              const impact = impactOf(b);
              const isSelected = b.brief_id === selected?.brief_id;
              return (
                <li key={b.brief_id}>
                  <Link
                    href={href({ brief: b.brief_id })}
                    className={isSelected ? styles.rowActive : styles.row}
                    aria-current={isSelected ? "true" : undefined}
                    scroll={false}
                  >
                    <span className={styles.rowTop}>
                      <span className={styles.rowDate}>{formatShortDate(b.period)}</span>
                      <span className={`${styles.rowImpact} num`} data-loss={impact < 0 || undefined}>
                        {formatImpact(impact)}
                      </span>
                    </span>
                    <span className={styles.rowHeadline}>{b.headline}</span>
                    <span className={styles.rowMeta}>
                      <span className={styles.marks}>
                        {domainsOf(b).map((d) => (
                          <DomainMark key={d} domain={d} size={14} />
                        ))}
                      </span>
                      {b.items.length} issue{b.items.length === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {briefs.length === 0 && (
            <EmptyState
              title="No briefs match"
              icon={SearchX}
              action={
                <ButtonLink href="/history" variant="secondary" size="sm">
                  Clear filters
                </ButtonLink>
              }
            >
              Try a different search or domain.
            </EmptyState>
          )}
        </div>

        <div className={styles.detail}>
          {selected ? (
            <article className={styles.detailInner}>
              <Link href={href({})} className={styles.back} scroll={false}>
                <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                All briefs
              </Link>

              <header className={styles.detailHead}>
                <div className={styles.detailDate}>{formatDate(selected.period)}</div>
                <h2 className={styles.headline}>{selected.headline}</h2>
                <div className={styles.detailFoot}>
                  <span className={styles.detailMeta}>
                    <span className="mono">{selected.brief_id}</span> · Generated {formatDateTime(selected.generated_at)}
                  </span>
                  <div className={styles.actions}>
                    <ButtonLink
                      href={`/?q=${encodeURIComponent(`Recap the brief for ${selected.period}`)}`}
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

              {selected.kpis.length > 0 && <KpiStrip kpis={selected.kpis} />}

              <div className={styles.issuesHead}>
                <h3 className={styles.issuesTitle}>
                  {issues.length} issue{issues.length === 1 ? "" : "s"}, ranked by impact
                </h3>
                <span className={styles.issuesTotal}>
                  Total <span className="num">{formatImpact(impactOf(selected))}</span>
                </span>
              </div>

              <ol className={styles.issues}>
                {issues.map((item, i) => (
                  <li key={item.rank}>
                    <BriefItemCard item={item} position={i + 1} />
                  </li>
                ))}
              </ol>
            </article>
          ) : (
            <EmptyState title="No brief selected">Pick a brief from the list.</EmptyState>
          )}
        </div>
      </div>
    </>
  );
}

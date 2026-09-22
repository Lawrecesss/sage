import type { Metadata } from "next";
import Link from "next/link";
import { BriefItemCard } from "@/components/brief/BriefItemCard";
import { KpiStrip } from "@/components/brief/KpiStrip";
import styles from "@/components/history/history.module.css";
import { TopBar } from "@/components/shell/TopBar";
import { ButtonLink, ChipLink, DomainMark, EmptyState } from "@/components/ui";
import { listBriefs } from "@/lib/data";
import { formatDate, formatDateTime, formatImpact } from "@/lib/format";
import type { Brief, Domain } from "@/lib/types";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

const DOMAINS: Domain[] = ["sales", "inventory", "accounting"];

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

  const href = (next: { brief?: string; domain?: string }) => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    const d = next.domain ?? domain;
    if (d) qs.set("domain", d);
    if (next.brief) qs.set("brief", next.brief);
    return `/history${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <TopBar
        title="History"
        subtitle={`${all.length} briefs · newest first`}
        actions={<ButtonLink href="/?q=%2Fmorning-brief">Generate now</ButtonLink>}
      />

      <div className={styles.split}>
        <div className={styles.list}>
          <div className={styles.tools}>
            <form className={styles.search} method="get">
              {domain && <input type="hidden" name="domain" value={domain} />}
              <input
                className={styles.searchInput}
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search briefs…"
                aria-label="Search briefs"
              />
            </form>
            <div className={styles.filters}>
              <ChipLink href={href({ domain: undefined })} active={!domain}>
                All
              </ChipLink>
              {DOMAINS.map((d) => (
                <ChipLink key={d} href={href({ domain: d })} active={d === domain}>
                  {d}
                </ChipLink>
              ))}
            </div>
          </div>

          {briefs.map((b) => (
            <Link
              key={b.brief_id}
              href={href({ brief: b.brief_id })}
              className={b.brief_id === selected?.brief_id ? styles.rowActive : styles.row}
            >
              <div className={styles.rowTop}>
                <span className={styles.rowDate}>{b.period}</span>
                <span className={styles.rowImpact}>{formatImpact(impactOf(b))}</span>
              </div>
              <span className={styles.rowHeadline}>{b.headline}</span>
              <span className={styles.rowMeta}>
                <span className={styles.marks}>
                  {domainsOf(b).map((d) => (
                    <DomainMark key={d} domain={d} />
                  ))}
                </span>
                {b.items.length} item{b.items.length === 1 ? "" : "s"}
              </span>
            </Link>
          ))}

          {briefs.length === 0 && (
            <div style={{ padding: 16 }}>
              <EmptyState title="No briefs match">Try clearing the search or filter.</EmptyState>
            </div>
          )}
        </div>

        <div className={styles.detail}>
          {selected ? (
            <>
              <div className={styles.detailHead}>
                <div>
                  <div className={styles.detailDate}>{formatDate(selected.period)}</div>
                  <div className={styles.detailMeta}>
                    {selected.brief_id} · generated {formatDateTime(selected.generated_at)}
                  </div>
                </div>
                <div className={styles.actions}>
                  <ButtonLink href={`/?q=${encodeURIComponent(`Recap the brief for ${selected.period}`)}`} variant="ghost">
                    Discuss in chat
                  </ButtonLink>
                  <ButtonLink href="/dashboard">Open dashboard</ButtonLink>
                </div>
              </div>

              <p className={styles.headline}>{selected.headline}</p>

              {selected.kpis.length > 0 && <KpiStrip kpis={selected.kpis} />}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selected.items.map((item) => (
                  <BriefItemCard key={item.rank} item={item} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="No brief selected">Pick a brief from the list.</EmptyState>
          )}
        </div>
      </div>
    </>
  );
}

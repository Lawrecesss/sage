// The dashboard's "Customer enquiries" section: the open backlog, how many are overdue and how
// many need someone right now, then the enquiries to act on, most urgent first. Not tied to the
// domain tabs — enquiries cut across sales, inventory and accounts — so it renders the same on
// every tab. Data from lib/enquiries.ts (same triage rules as the agent's get_customer_enquiries).

import { CircleCheck, FileText } from "lucide-react";
import Link from "next/link";
import { ButtonLink, Card, EmptyState, uiStyles } from "@/components/ui";
import { formatDateTime, formatSGD, humanize } from "@/lib/format";
import type { EnquiryAttention, EnquiryItem, EnquiryOverview } from "@/lib/types";
import styles from "./enquiries.module.css";

const MAX_ROWS = 8;

const ATTENTION: Record<EnquiryAttention, { label: string; tone: string }> = {
  immediate: { label: "Act now", tone: uiStyles.toneNegative },
  overdue: { label: "Overdue", tone: uiStyles.toneWarning },
  due_soon: { label: "Due soon", tone: uiStyles.toneNeutral },
  on_track: { label: "On track", tone: uiStyles.toneGood },
};

function AttentionBadge({ attention }: { attention: EnquiryAttention }) {
  const a = ATTENTION[attention];
  return (
    <span className={`${uiStyles.badge} ${a.tone}`}>
      <span className={uiStyles.badgeDot} aria-hidden />
      {a.label}
    </span>
  );
}

function lateness(hours: number): string {
  const abs = Math.abs(hours);
  const text = abs >= 48 ? `${Math.round(abs / 24)}d` : abs >= 1 ? `${Math.round(abs)}h` : `${Math.max(1, Math.round(abs * 60))}m`;
  return hours > 0 ? `${text} late` : `due in ${text}`;
}

const chatHref = (e: EnquiryItem) =>
  `/?q=${encodeURIComponent(`What's going on with customer enquiry ${e.enquiry_id} ("${e.subject}") and what should I do about it?`)}`;

export function EnquiryPanel({ overview }: { overview: EnquiryOverview | null }) {
  const action = (
    <ButtonLink href="/?q=%2Fenquiry-report" variant="secondary" size="sm" icon={FileText}>
      Enquiry report
    </ButtonLink>
  );

  if (!overview) {
    return (
      <section className={styles.section} aria-label="Customer enquiries">
        <Card title="Customer enquiries" aside={action}>
          <EmptyState title="No enquiry data">This tenant has no customer-enquiry data yet.</EmptyState>
        </Card>
      </section>
    );
  }

  const { backlog, flow } = overview;
  const rows = overview.items.filter((i) => i.attention !== "on_track").slice(0, MAX_ROWS);
  const stats: { label: string; value: string; tone?: string; sub?: string }[] = [
    { label: "Open", value: String(backlog.open), sub: `${backlog.unanswered} not yet answered` },
    { label: "Overdue", value: String(backlog.overdue), tone: backlog.overdue ? styles.warn : undefined, sub: "Past resolution target" },
    {
      label: "Needs immediate attention",
      value: String(backlog.immediate),
      tone: backlog.immediate ? styles.bad : styles.good,
      sub: `${backlog.due_soon} more due within 4h`,
    },
    {
      label: "Resolved within SLA",
      value: flow.sla_hit_rate == null ? "n/a" : `${Math.round(flow.sla_hit_rate * 100)}%`,
      sub: `${flow.resolved_within_sla} of ${flow.resolved} resolved, last 7 days`,
    },
    {
      label: "Median first response",
      value: flow.median_first_response_hours == null ? "n/a" : `${flow.median_first_response_hours}h`,
      sub: `${flow.received} received, last 7 days`,
    },
  ];

  return (
    <section className={styles.section} aria-label="Customer enquiries">
      <Card
        flush
        title="Customer enquiries"
        description={`Open backlog as of ${formatDateTime(overview.as_of)} · most urgent first`}
        aside={action}
      >
        <dl className={styles.stats}>
          {stats.map((s) => (
            <div key={s.label} className={styles.stat}>
              <dt className={styles.statLabel}>{s.label}</dt>
              <dd className={`${styles.statValue} num ${s.tone ?? ""}`}>{s.value}</dd>
              {s.sub && <dd className={styles.statSub}>{s.sub}</dd>}
            </div>
          ))}
        </dl>

        {rows.length === 0 ? (
          <EmptyState title="Nothing overdue" icon={CircleCheck}>
            Every open enquiry is inside its resolution target.
          </EmptyState>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Enquiry</th>
                    <th>Priority</th>
                    <th className={styles.right}>Timing</th>
                    <th className={styles.right}>Order value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.enquiry_id} className={styles.row}>
                      <td>
                        <AttentionBadge attention={e.attention} />
                      </td>
                      <td className={styles.wrap}>
                        <Link href={chatHref(e)} className={styles.rowLink}>
                          {e.subject}
                        </Link>
                        <span className={styles.sub}>
                          <span className="mono">{e.enquiry_id}</span> · {humanize(e.topic)} · {humanize(e.channel)} via {e.contact_method.replace(/_/g, " ")}
                          {e.responded ? "" : " · not answered"}
                        </span>
                      </td>
                      <td>{humanize(e.priority)}</td>
                      <td className={`${styles.right} num ${e.hours_overdue > 0 ? styles.bad : styles.muted}`}>
                        {lateness(e.hours_overdue)}
                      </td>
                      <td className={`${styles.right} num`}>
                        {e.value_at_stake_sgd == null ? "—" : formatSGD(e.value_at_stake_sgd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className={styles.cards}>
              {rows.map((e) => (
                <li key={e.enquiry_id}>
                  <Link href={chatHref(e)} className={styles.card}>
                    <span className={styles.cardTop}>
                      <AttentionBadge attention={e.attention} />
                      <span className={`num ${e.hours_overdue > 0 ? styles.bad : styles.muted}`}>{lateness(e.hours_overdue)}</span>
                    </span>
                    <span className={styles.cardTitle}>{e.subject}</span>
                    <span className={styles.sub}>
                      <span className="mono">{e.enquiry_id}</span> · {humanize(e.priority)} · {humanize(e.topic)}
                      {e.responded ? "" : " · not answered"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {backlog.overdue + backlog.due_soon > rows.length && (
              <p className={styles.more}>
                Showing the {rows.length} most urgent of {backlog.overdue + backlog.due_soon} overdue or due-soon enquiries — the
                enquiry report covers them all.
              </p>
            )}
          </>
        )}
      </Card>
    </section>
  );
}

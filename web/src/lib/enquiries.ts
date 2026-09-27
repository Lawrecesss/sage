// The customer-enquiry scan: the open backlog as of a moment, triaged so overdue enquiries and
// the ones needing immediate attention come first, plus how enquiries were handled over a recent
// window. It feeds the dashboard's "Customer enquiries" section and, as exact facts, the
// enquiry-report prompt (commands.ts) — the agent then checks it with get_customer_enquiries.
//
// The triage rules are the same as retail-mcp's get_customer_enquiries (see the constants at the
// top of mcp/src/retail_mcp/server.py) — change them together, or the dashboard and the agent
// will disagree about what needs attention. Status is never stored in fact_customer_enquiry; it
// is derived here as of `asOf`, so a report replayed for an earlier moment sees that moment's
// backlog.

import { getPool } from "@/lib/db";
import { formatLocal } from "@/lib/report-windows";
import type { EnquiryAttention, EnquiryItem, EnquiryOverview, EnquiryPriority } from "@/lib/types";

const VALID_SCHEMA = /^[a-z][a-z0-9_]{0,62}$/;
const PRIORITY_RANK: Record<EnquiryPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const ATTENTION_RANK: Record<EnquiryAttention, number> = { immediate: 0, overdue: 1, due_soon: 2, on_track: 3 };
const LONG_OVERDUE_HOURS = 48;
const DUE_SOON_HOURS = 4;
const HOUR_MS = 3_600_000;

export function enquiryAttention(hoursOverdue: number, priority: string, topic: string, responded: boolean): EnquiryAttention {
  if (hoursOverdue > 0) {
    const immediate =
      priority === "urgent" || priority === "high" || topic === "complaint" || !responded || hoursOverdue >= LONG_OVERDUE_HOURS;
    return immediate ? "immediate" : "overdue";
  }
  return -hoursOverdue <= DUE_SOON_HOURS ? "due_soon" : "on_track";
}

/** Most urgent first: attention level, then priority, then most overdue. */
export function compareEnquiries(a: EnquiryItem, b: EnquiryItem): number {
  return (
    ATTENTION_RANK[a.attention] - ATTENTION_RANK[b.attention] ||
    (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
    b.hours_overdue - a.hours_overdue
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

type OpenRow = {
  enquiry_id: string;
  created_at: Date;
  subject: string;
  topic: string;
  priority: EnquiryPriority;
  channel: string;
  contact_method: string;
  segment: string;
  order_id: string | null;
  sku: string | null;
  sku_name: string | null;
  value_at_stake_sgd: number | null;
  due_at: Date;
  responded: boolean;
};

type FlowRow = {
  received: string;
  resolved: string;
  resolved_within_sla: string;
  median_first_response_hours: number | null;
};

/** The backlog as of `asOf`, and handling ("flow") between `windowStart` and `asOf`. */
export async function scanEnquiries(tenantId: string, asOf: Date, windowStart: Date, limit = 50): Promise<EnquiryOverview> {
  if (!VALID_SCHEMA.test(tenantId)) throw new Error(`invalid tenant schema name: ${tenantId}`);
  const pool = getPool();
  const [open, flow] = await Promise.all([
    pool.query<OpenRow>(
      `SELECT e.enquiry_id, e.created_at, e.subject, e.topic, e.priority, e.channel, e.contact_method,
              e.segment, e.order_id, e.sku, s.name AS sku_name, e.value_at_stake_sgd, e.due_at,
              COALESCE(e.first_response_at <= $1, false) AS responded
         FROM "${tenantId}".fact_customer_enquiry e
         LEFT JOIN "${tenantId}".dim_sku s ON s.sku = e.sku
        WHERE e.created_at <= $1 AND (e.resolved_at IS NULL OR e.resolved_at > $1)`,
      [asOf],
    ),
    pool.query<FlowRow>(
      `WITH w AS (
         SELECT *, created_at > $2 AS received_in_window,
                (resolved_at > $2 AND resolved_at <= $1) AS resolved_in_window
           FROM "${tenantId}".fact_customer_enquiry
          WHERE created_at <= $1 AND (created_at > $2 OR resolved_at > $2)
       )
       SELECT COUNT(*) FILTER (WHERE received_in_window) AS received,
              COUNT(*) FILTER (WHERE resolved_in_window) AS resolved,
              COUNT(*) FILTER (WHERE resolved_in_window AND resolved_at <= due_at) AS resolved_within_sla,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600)
                FILTER (WHERE received_in_window AND first_response_at <= $1) AS median_first_response_hours
         FROM w`,
      [asOf, windowStart],
    ),
  ]);

  const items: EnquiryItem[] = open.rows
    .map((r) => {
      const hoursOverdue = (asOf.getTime() - r.due_at.getTime()) / HOUR_MS;
      return {
        enquiry_id: r.enquiry_id,
        created_at: r.created_at.toISOString(),
        subject: r.subject,
        topic: r.topic,
        priority: r.priority,
        channel: r.channel,
        contact_method: r.contact_method,
        segment: r.segment,
        order_id: r.order_id,
        sku: r.sku,
        sku_name: r.sku_name,
        value_at_stake_sgd: r.value_at_stake_sgd == null ? null : Number(r.value_at_stake_sgd),
        due_at: r.due_at.toISOString(),
        hours_overdue: round1(hoursOverdue),
        age_hours: round1((asOf.getTime() - r.created_at.getTime()) / HOUR_MS),
        responded: r.responded,
        attention: enquiryAttention(hoursOverdue, r.priority, r.topic, r.responded),
      };
    })
    .sort(compareEnquiries);

  const late = (i: EnquiryItem) => i.attention === "immediate" || i.attention === "overdue";
  const topics = new Map<string, { topic: string; open: number; overdue: number }>();
  for (const i of items) {
    const t = topics.get(i.topic) ?? { topic: i.topic, open: 0, overdue: 0 };
    t.open += 1;
    t.overdue += late(i) ? 1 : 0;
    topics.set(i.topic, t);
  }

  const f = flow.rows[0];
  const resolved = Number(f?.resolved ?? 0);
  const within = Number(f?.resolved_within_sla ?? 0);
  return {
    as_of: asOf.toISOString(),
    window_start: windowStart.toISOString(),
    backlog: {
      open: items.length,
      overdue: items.filter(late).length,
      immediate: items.filter((i) => i.attention === "immediate").length,
      due_soon: items.filter((i) => i.attention === "due_soon").length,
      unanswered: items.filter((i) => !i.responded).length,
      value_at_stake_sgd: Math.round(items.reduce((s, i) => s + (i.value_at_stake_sgd ?? 0), 0) * 100) / 100,
    },
    flow: {
      received: Number(f?.received ?? 0),
      resolved,
      resolved_within_sla: within,
      sla_hit_rate: resolved ? within / resolved : null,
      median_first_response_hours: f?.median_first_response_hours == null ? null : round1(Number(f.median_first_response_hours)),
    },
    by_topic: [...topics.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.topic.localeCompare(b.topic)),
    items: items.slice(0, limit),
  };
}

/** scanEnquiries, but a failed scan (e.g. a tenant seeded before enquiries existed) returns null. */
export async function scanEnquiriesSafe(
  tenantId: string,
  asOf: Date,
  windowStart: Date,
  limit?: number,
): Promise<EnquiryOverview | null> {
  try {
    return await scanEnquiries(tenantId, asOf, windowStart, limit);
  } catch (err) {
    console.error(`[enquiries] scan failed for ${tenantId}`, err);
    return null;
  }
}

const humanTopic = (t: string) => t.replace(/_/g, " ");

function overdueLabel(hours: number): string {
  if (hours <= 0) return `due in ${Math.max(1, Math.round(-hours))}h`;
  return hours >= 48 ? `${Math.round(hours / 24)} days overdue` : `${Math.round(hours)}h overdue`;
}

/** The scan's findings as report-prompt lines — exact facts for the agent to confirm and explain. */
export function enquiryPromptLines(current: EnquiryOverview | null, baseline: EnquiryOverview | null): string[] {
  if (!current) {
    return [
      "",
      "The pre-report enquiry scan could not run, so there are no pre-computed figures: get every figure from get_customer_enquiries.",
    ];
  }
  const b = current.backlog;
  const attention = current.items.filter((i) => i.attention === "immediate" || i.attention === "overdue");
  const lines = [
    "",
    `Pre-computed enquiry scan (as of ${formatLocal(new Date(current.as_of))}; exact, from the enquiries table):`,
    `- Open ${b.open}, overdue ${b.overdue}, needing immediate attention ${b.immediate}, due within 4h ${b.due_soon}, never answered ${b.unanswered}, order value tied to open enquiries SGD ${b.value_at_stake_sgd.toFixed(0)}.`,
    ...(baseline
      ? [
          `- Baseline backlog (as of ${formatLocal(new Date(baseline.as_of))}): open ${baseline.backlog.open}, overdue ${baseline.backlog.overdue}, needing immediate attention ${baseline.backlog.immediate}.`,
        ]
      : []),
    `- Open by topic (open / overdue): ${current.by_topic.map((t) => `${humanTopic(t.topic)} ${t.open}/${t.overdue}`).join(", ") || "none"}.`,
    ...(attention.length
      ? [
          "- Overdue enquiries, most urgent first:",
          ...attention.map(
            (i) =>
              `  - [${i.attention === "immediate" ? "IMMEDIATE" : "overdue"}] ${i.enquiry_id} (${i.priority}, ${humanTopic(i.topic)}, ${i.channel}): "${i.subject}" — ${overdueLabel(i.hours_overdue)}` +
              (i.responded ? "" : ", never answered") +
              (i.value_at_stake_sgd != null ? `, SGD ${i.value_at_stake_sgd.toFixed(0)} order` : ""),
          ),
        ]
      : ["- Nothing is overdue."]),
    "Confirm these with get_customer_enquiries (pass as_of for the baseline figures) before reporting them, and say so if the tool disagrees. Never invent an enquiry, a customer name or a figure the tools didn't return.",
  ];
  return lines;
}

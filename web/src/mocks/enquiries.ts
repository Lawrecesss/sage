// Customer-enquiry fixture for mock mode (SAGE_DATA_SOURCE=mock): the dashboard's enquiry
// section, shaped like lib/enquiries.ts's scanEnquiries output. Timestamps are relative to
// `now`, so the "late by" figures stay believable whenever the mock is served.

import type { EnquiryItem, EnquiryOverview } from "@/lib/types";

const HOUR_MS = 3_600_000;

type Seed = Omit<EnquiryItem, "created_at" | "due_at" | "hours_overdue" | "age_hours"> & {
  ageHours: number;
  slaHours: number;
};

const SEEDS: Seed[] = [
  { enquiry_id: "ENQ-0005121", subject: "Oak Bedside Lamp arrived damaged (ORD-0044870)", topic: "delivery_issue", priority: "urgent", channel: "shopify", contact_method: "email", segment: "online_regular", order_id: "ORD-0044870", sku: "SKU-0412", sku_name: "Oak Bedside Lamp", value_at_stake_sgd: 189, responded: true, ageHours: 9.5, slaHours: 4, attention: "immediate" },
  { enquiry_id: "ENQ-0005098", subject: "Complaint about Linen Duvet Cover (ORD-0044512)", topic: "complaint", priority: "high", channel: "outlet", contact_method: "phone", segment: "loyalty_member", order_id: "ORD-0044512", sku: "SKU-0107", sku_name: "Linen Duvet Cover", value_at_stake_sgd: 264, responded: true, ageHours: 41, slaHours: 24, attention: "immediate" },
  { enquiry_id: "ENQ-0005064", subject: "Refund not received for ORD-0043988", topic: "return_refund", priority: "normal", channel: "lazada", contact_method: "marketplace", segment: "deal_seeker", order_id: "ORD-0043988", sku: "SKU-0733", sku_name: "Ceramic Serving Bowl", value_at_stake_sgd: 96, responded: false, ageHours: 60, slaHours: 48, attention: "immediate" },
  { enquiry_id: "ENQ-0005012", subject: "Invoice query on ORD-0043510", topic: "billing", priority: "high", channel: "outlet", contact_method: "email", segment: "trade_wholesale", order_id: "ORD-0043510", sku: "SKU-0921", sku_name: "Rattan Storage Basket", value_at_stake_sgd: 1_140, responded: true, ageHours: 30, slaHours: 24, attention: "immediate" },
  { enquiry_id: "ENQ-0005077", subject: "No tracking update for ORD-0044102", topic: "order_status", priority: "normal", channel: "shopee", contact_method: "marketplace", segment: "online_regular", order_id: "ORD-0044102", sku: "SKU-0356", sku_name: "Glass Tumbler Set", value_at_stake_sgd: 58, responded: true, ageHours: 55, slaHours: 48, attention: "overdue" },
  { enquiry_id: "ENQ-0005101", subject: "When will Stoneware Mug be back in stock?", topic: "stock_availability", priority: "low", channel: "outlet", contact_method: "in_store", segment: "walk_in", order_id: null, sku: "SKU-0288", sku_name: "Stoneware Mug", value_at_stake_sgd: null, responded: true, ageHours: 78, slaHours: 72, attention: "overdue" },
  { enquiry_id: "ENQ-0005133", subject: "Where is my order ORD-0045011?", topic: "order_status", priority: "high", channel: "shopify", contact_method: "chat", segment: "online_regular", order_id: "ORD-0045011", sku: "SKU-0519", sku_name: "Bamboo Bath Mat", value_at_stake_sgd: 42, responded: true, ageHours: 21.5, slaHours: 24, attention: "due_soon" },
  { enquiry_id: "ENQ-0005140", subject: "Question about Brass Photo Frame", topic: "product_question", priority: "normal", channel: "shopify", contact_method: "email", segment: "loyalty_member", order_id: null, sku: "SKU-0640", sku_name: "Brass Photo Frame", value_at_stake_sgd: null, responded: true, ageHours: 12, slaHours: 48, attention: "on_track" },
];

export function mockEnquiryOverview(now = new Date()): EnquiryOverview {
  const items: EnquiryItem[] = SEEDS.map(({ ageHours, slaHours, ...rest }) => ({
    ...rest,
    created_at: new Date(now.getTime() - ageHours * HOUR_MS).toISOString(),
    due_at: new Date(now.getTime() - (ageHours - slaHours) * HOUR_MS).toISOString(),
    hours_overdue: Math.round((ageHours - slaHours) * 10) / 10,
    age_hours: ageHours,
  }));
  const late = items.filter((i) => i.attention === "immediate" || i.attention === "overdue");
  const topics = new Map<string, { topic: string; open: number; overdue: number }>();
  for (const i of items) {
    const t = topics.get(i.topic) ?? { topic: i.topic, open: 0, overdue: 0 };
    t.open += 1;
    t.overdue += late.includes(i) ? 1 : 0;
    topics.set(i.topic, t);
  }
  return {
    as_of: now.toISOString(),
    window_start: new Date(now.getTime() - 7 * 24 * HOUR_MS).toISOString(),
    backlog: {
      open: 27,
      overdue: late.length,
      immediate: items.filter((i) => i.attention === "immediate").length,
      due_soon: items.filter((i) => i.attention === "due_soon").length,
      unanswered: items.filter((i) => !i.responded).length,
      value_at_stake_sgd: 3_412,
    },
    flow: { received: 81, resolved: 77, resolved_within_sla: 58, sla_hit_rate: 58 / 77, median_first_response_hours: 3.4 },
    by_topic: [...topics.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open),
    items,
  };
}

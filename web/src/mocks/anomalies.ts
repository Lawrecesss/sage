// Anomaly fixture for mock mode (SAGE_DATA_SOURCE=mock): what lib/anomalies.ts's scan returns
// for the dashboard's Anomalies card and the /anomalies page. Periods are the last 7 complete
// days vs the 7 before, relative to `now`, like the live scan.

import type { Anomaly } from "@/lib/types";

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function mockAnomalies(now = new Date()): Anomaly[] {
  const end = new Date(now.getTime() - DAY_MS);
  const period = { start: iso(new Date(end.getTime() - 6 * DAY_MS)), end: iso(end) };
  const baseline = { start: iso(new Date(end.getTime() - 13 * DAY_MS)), end: iso(new Date(end.getTime() - 7 * DAY_MS)) };
  return [
    {
      kind: "divergence",
      severity: "high",
      summary: "Linen Duvet Cover is up 64% while Cotton Duvet Cover is down 71% in Bedding & Linen: shoppers are likely switching between them.",
      items: [
        { sku: "LIN-0107", name: "Linen Duvet Cover", category: "Bedding & Linen", current: 6_840, previous: 4_170, change: 0.64, onHand: 18, daysOfCover: 4, leadTimeDays: 12 },
        { sku: "LIN-0112", name: "Cotton Duvet Cover", category: "Bedding & Linen", current: 1_120, previous: 3_860, change: -0.71, onHand: 0, daysOfCover: null, leadTimeDays: 9 },
      ],
      action: "Reorder Cotton Duvet Cover (LIN-0112) now: it's out of stock (0 on hand), which explains the switch. Linen Duvet Cover has only about 4 days of stock, so reorder it now.",
      period,
      baseline,
    },
    {
      kind: "drop",
      severity: "medium",
      summary: "Oak Bedside Lamp is down 58% (S$2,950 to S$1,240).",
      items: [
        { sku: "LGT-0412", name: "Oak Bedside Lamp", category: "Lighting", current: 1_240, previous: 2_950, change: -0.58, onHand: 64, daysOfCover: 52, leadTimeDays: 21 },
      ],
      action: "Oak Bedside Lamp (LGT-0412) still has 64 in stock but has stopped selling: check its price against competitors, its listing and its placement.",
      period,
      baseline,
    },
    {
      kind: "surge",
      severity: "low",
      summary: "Brass Photo Frame is up 112% (S$880 to S$1,870).",
      items: [
        { sku: "DEC-0640", name: "Brass Photo Frame", category: "Home Decor", current: 1_870, previous: 880, change: 1.12, onHand: 140, daysOfCover: 38, leadTimeDays: 14 },
      ],
      action: "Find out what's driving Brass Photo Frame (DEC-0640), such as a promotion, a listing change or a trend, and keep it going. Stock covers about 38 days.",
      period,
      baseline,
    },
  ];
}

// The anomaly scan's findings (lib/anomalies.ts): on a saved report above the agent's prose, on
// the dashboard's Anomalies card, and on the /anomalies page.

import { ArrowDownRight, ArrowUpRight, CircleCheck, Lightbulb, MessageSquare } from "lucide-react";
import Link from "next/link";
import { EmptyState, SeverityBadge } from "@/components/ui";
import { formatMoney, formatShortDate } from "@/lib/format";
import type { Anomaly, AnomalyItem } from "@/lib/types";
import styles from "./anomalies.module.css";

const KIND_LABEL: Record<Anomaly["kind"], string> = { divergence: "Divergence", surge: "Surge", drop: "Drop" };

/** Chat prompt for one anomaly — its exact figures, so the agent starts from the same facts. */
export function explainAnomalyHref(a: Anomaly): string {
  const skus = a.items.map((i) => `${i.name} (${i.sku})`).join(" and ");
  return `/?q=${encodeURIComponent(
    `Explain this anomaly: ${a.summary} (${skus}, ${a.period.start} to ${a.period.end} vs ${a.baseline.start} to ${a.baseline.end}). What is causing it and what should I do?`,
  )}`;
}

function Item({ item }: { item: AnomalyItem }) {
  const up = item.current >= item.previous;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const change = item.change === null ? "new" : `${up ? "+" : ""}${Math.round(item.change * 100)}%`;
  return (
    <li className={styles.anomalyItem}>
      <Icon size={14} strokeWidth={2} className={up ? styles.up : styles.down} aria-label={up ? "up" : "down"} />
      <span className={styles.anomalyName}>{item.name}</span>
      <span className={styles.anomalyNums}>
        <span className="num">
          {formatMoney(item.previous)} → {formatMoney(item.current)}
        </span>
        <span className={`num ${up ? styles.up : styles.down}`}>{change}</span>
        {item.onHand != null && (
          <span className={`num ${item.onHand <= 0 ? styles.down : ""}`}>
            {item.onHand <= 0 ? "Out of stock" : `${item.onHand} in stock`}
          </span>
        )}
      </span>
    </li>
  );
}

export function AnomalyList({
  anomalies,
  title = "Anomalies flagged",
  aside,
  explain = false,
  emptyText,
  className,
}: {
  anomalies: Anomaly[];
  title?: string;
  /** Rendered at the right of the heading, e.g. a link to /anomalies. */
  aside?: React.ReactNode;
  /** Adds an "Explain in chat" link to each anomaly. */
  explain?: boolean;
  /** Shown instead of rendering nothing when there are no anomalies. */
  emptyText?: string;
  className?: string;
}) {
  if (anomalies.length === 0 && !emptyText) return null;
  const first = anomalies[0];
  return (
    <section className={`${styles.anomalies} ${className ?? ""}`} aria-label={title}>
      <div className={styles.anomaliesHead}>
        <div className={styles.anomaliesHeadText}>
          <h3 className={styles.anomaliesTitle}>{title}</h3>
          {first && (
            <span className={styles.anomaliesMeta}>
              Gross revenue by SKU, {formatShortDate(first.period.start)}–{formatShortDate(first.period.end)} vs{" "}
              {formatShortDate(first.baseline.start)}–{formatShortDate(first.baseline.end)}
            </span>
          )}
        </div>
        {aside}
      </div>
      {anomalies.length === 0 ? (
        <EmptyState title="No anomalies" icon={CircleCheck}>
          {emptyText}
        </EmptyState>
      ) : (
        <ul className={styles.anomalyRows}>
          {anomalies.map((a, i) => (
            <li key={i} className={styles.anomaly}>
              <div className={styles.anomalyTop}>
                <SeverityBadge severity={a.severity} />
                <span className={styles.anomalyKind}>{KIND_LABEL[a.kind]}</span>
                {explain && (
                  <Link href={explainAnomalyHref(a)} className={styles.explain}>
                    <MessageSquare size={14} strokeWidth={2} aria-hidden />
                    Explain in chat
                  </Link>
                )}
              </div>
              <p className={styles.anomalySummary}>{a.summary}</p>
              <ul className={styles.anomalyItems}>
                {a.items.map((item) => (
                  <Item key={item.sku} item={item} />
                ))}
              </ul>
              {a.action && (
                <p className={styles.anomalyAction}>
                  <Lightbulb size={14} strokeWidth={2} aria-hidden />
                  <span>
                    <strong>Recommended:</strong> {a.action}
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

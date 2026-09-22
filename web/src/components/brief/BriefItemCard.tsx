import Link from "next/link";
import { DomainMark, DomainTag, SeverityBadge } from "@/components/ui";
import { formatImpact } from "@/lib/format";
import type { BriefItem } from "@/lib/types";
import styles from "./brief.module.css";

export function BriefItemCard({ item }: { item: BriefItem }) {
  const askPrompt = `/explain ${item.signal_ids[0] ?? ""}`.trim();

  return (
    <article className={styles.item}>
      <div className={styles.itemHead}>
        <div className={styles.rank}>{item.rank}</div>
        <div className={styles.meta}>
          <SeverityBadge severity={item.severity} />
          <DomainTag domain={item.domain} />
        </div>
        <div className={styles.impact}>
          <div className={`${styles.impactValue} num`}>{formatImpact(item.dollar_impact_est)}</div>
          <span className={styles.impactLabel}>est. impact</span>
        </div>
        <h3 className={styles.title}>{item.title}</h3>

        <div className={styles.body}>
          <p className={styles.summary}>{item.summary}</p>

          {item.causal_chain.length > 0 && (
            <ol className={styles.chain} aria-label="Why this happened">
              {item.causal_chain.map((step, i) => (
                <li key={i} className={styles.step}>
                  <span className={styles.stepMark}>
                    <DomainMark domain={step.domain} />
                  </span>
                  {step.claim}{" "}
                  <Link href={`/metrics/${step.metric_id}`} className={styles.stepMetric}>
                    {step.metric_id}
                  </Link>
                </li>
              ))}
            </ol>
          )}

          {item.recommended_action && (
            <p className={styles.action}>
              <span className={styles.actionLabel}>Do this</span>
              <span>{item.recommended_action}</span>
            </p>
          )}
        </div>
      </div>

      <div className={styles.links}>
        {item.signal_ids.map((id) => (
          <Link key={id} href={`/signals/${id}`}>
            {id}
          </Link>
        ))}
        <Link href={`/?q=${encodeURIComponent(askPrompt)}`}>Ask Sage about this →</Link>
      </div>
    </article>
  );
}

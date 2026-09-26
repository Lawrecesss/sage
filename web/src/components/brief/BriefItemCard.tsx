import { ArrowRight, MessageSquare } from "lucide-react";
import Link from "next/link";
import { DomainTag, MetricKey, SeverityBadge, SignalChip } from "@/components/ui";
import { formatImpact } from "@/lib/format";
import type { BriefItem } from "@/lib/types";
import styles from "./brief.module.css";

export function BriefItemCard({ item, position = item.rank }: { item: BriefItem; position?: number }) {
  const askPrompt = `/explain ${item.signal_ids[0] ?? ""}`.trim();

  return (
    <article className={styles.item}>
      <div className={styles.itemHead}>
        <div className={styles.headText}>
          <div className={styles.meta}>
            <span className={styles.rank} aria-label={`Rank ${position}`}>
              {position}
            </span>
            <SeverityBadge severity={item.severity} />
            <DomainTag domain={item.domain} />
          </div>
          <h3 className={styles.title}>{item.title}</h3>
        </div>
        <div className={styles.impact}>
          <div className={`${styles.impactValue} num`} data-loss={item.dollar_impact_est < 0 || undefined}>
            {formatImpact(item.dollar_impact_est)}
          </div>
          <span className={styles.impactLabel}>Estimated impact</span>
        </div>
      </div>

      <div className={styles.body}>
        <p className={styles.summary}>{item.summary}</p>

        {item.causal_chain.length > 0 && (
          <div>
            <h4 className={styles.sectionLabel}>Evidence</h4>
            <ol className={styles.chain} aria-label="Why this happened">
              {item.causal_chain.map((step, i) => (
                <li key={i} className={styles.step}>
                  <span className={styles.stepClaim}>{step.claim}</span>
                  <span className={styles.stepFoot}>
                    <DomainTag domain={step.domain} />
                    <MetricKey id={step.metric_id} />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {item.recommended_action && (
          <div className={styles.action}>
            <span className={styles.actionIcon} aria-hidden>
              <ArrowRight size={16} strokeWidth={2.25} />
            </span>
            <div>
              <div className={styles.actionLabel}>Do this</div>
              <p className={styles.actionText}>{item.recommended_action}</p>
            </div>
          </div>
        )}
      </div>

      <footer className={styles.links}>
        <span className={styles.signals}>
          <span className={styles.signalsLabel}>Signals</span>
          {item.signal_ids.map((id) => (
            <SignalChip key={id} id={id} />
          ))}
        </span>
        <Link href={`/?q=${encodeURIComponent(askPrompt)}`} className={styles.ask}>
          <MessageSquare size={14} strokeWidth={2} aria-hidden />
          Ask Sage about this
        </Link>
      </footer>
    </article>
  );
}

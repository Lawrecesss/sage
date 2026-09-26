// Presentational primitives. Monochrome: emphasis comes from fill and weight.

import Link from "next/link";
import type { Domain, Severity, SignalStatus } from "@/lib/types";
import styles from "./ui.module.css";

export function Spinner({ label }: { label?: string }) {
  return <span className={styles.spinner} role="status" aria-label={label ?? "Loading"} />;
}

/** Full-section loading state — used by route loading.tsx files and while a
 * client component is mid-transition. */
export function PageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={styles.spinnerPage} role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function Card({
  title,
  aside,
  children,
  className,
}: {
  title?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `${styles.card} ${className}` : styles.card}>
      {(title || aside) && (
        <div className={styles.cardHead}>
          {title && <h2 className={styles.cardTitle}>{title}</h2>}
          {aside && <span className={styles.cardAside}>{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

const SEVERITY_FILL: Record<Severity, string> = { high: "solid", medium: "outline", low: "ghost" };
const STATUS_FILL: Record<SignalStatus, string> = { open: "solid", acknowledged: "outline", resolved: "ghost" };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`${styles.badge} ${styles[SEVERITY_FILL[severity]]}`}>{severity}</span>;
}

export function StatusBadge({ status }: { status: SignalStatus }) {
  return <span className={`${styles.badge} ${styles[STATUS_FILL[status]]}`}>{status}</span>;
}

/** Domains are distinguished by mark shape — filled, half, hollow — never colour. */
export function DomainMark({ domain }: { domain: Domain }) {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden>
      {domain === "sales" && <rect width="9" height="9" fill="currentColor" />}
      {domain === "inventory" && (
        <>
          <rect width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <rect width="4.5" height="9" fill="currentColor" />
        </>
      )}
      {domain === "accounting" && <rect x="0.6" y="0.6" width="7.8" height="7.8" fill="none" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  );
}

export function DomainTag({ domain }: { domain?: Domain }) {
  if (!domain) return null;
  return (
    <span className={styles.domain}>
      <DomainMark domain={domain} />
      {domain}
    </span>
  );
}

/** A change, with an arrow for direction and weight for "this is the bad one". */
export function Delta({ tone, children }: { tone: "good" | "bad" | "neutral"; children: React.ReactNode }) {
  const cls = tone === "bad" ? styles.deltaBad : tone === "good" ? styles.deltaGood : styles.deltaNeutral;
  return <span className={`${styles.delta} ${cls}`}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  return (
    <Link href={href} className={variant === "primary" ? styles.button : styles.buttonGhost}>
      {children}
    </Link>
  );
}

export function ChipLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  // prefetch={false}: these chips switch a searchParam on a fully dynamic page (e.g. the
  // dashboard's domain tabs) — every click needs a fresh server render, and Link's default
  // prefetch can otherwise serve a stale client Router Cache entry for the same pathname.
  return (
    <Link href={href} prefetch={false} className={active ? styles.chipActive : styles.chip}>
      {children}
    </Link>
  );
}

export { styles as uiStyles };

// Presentational primitives. Emphasis comes from surface elevation and weight; colour is
// reserved for meaning (accent = interactive, semantic tones = good / bad / warning).

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Landmark, Package, ShoppingBag, type LucideIcon } from "lucide-react";
import type { Tone } from "@/lib/format";
import type { Domain, Severity, SignalStatus } from "@/lib/types";
import styles from "./ui.module.css";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

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
  description,
  aside,
  children,
  className,
  flush,
}: {
  title?: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** No inner padding — for tables and lists that run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section className={cx(styles.card, flush && styles.cardFlush, className)}>
      {(title || aside) && (
        <div className={styles.cardHead}>
          <div className={styles.cardHeadText}>
            {title && <h2 className={styles.cardTitle}>{title}</h2>}
            {description && <p className={styles.cardDesc}>{description}</p>}
          </div>
          {aside && <div className={styles.cardAside}>{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const SEVERITY_TONE: Record<Severity, string> = { high: styles.toneNegative, medium: styles.toneWarning, low: styles.toneNeutral };
const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cx(styles.badge, SEVERITY_TONE[severity])}>
      <span className={styles.badgeDot} aria-hidden />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/** A coloured dot with an accessible label — the compact form of SeverityBadge. */
export function SeverityDot({ severity }: { severity: Severity }) {
  return (
    <span className={cx(styles.sevDot, SEVERITY_TONE[severity])} title={`${SEVERITY_LABEL[severity]} severity`}>
      <span className="visually-hidden">{SEVERITY_LABEL[severity]} severity</span>
    </span>
  );
}

/** Status is secondary information: always muted, never the loudest thing in a row. */
export function StatusBadge({ status }: { status: SignalStatus }) {
  return (
    <span className={cx(styles.status, status === "open" && styles.statusOpen)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const DOMAIN_ICON: Record<Domain, LucideIcon> = { sales: ShoppingBag, inventory: Package, accounting: Landmark };

export function DomainMark({ domain, size = 14 }: { domain: Domain; size?: number }) {
  const Icon = DOMAIN_ICON[domain];
  return <Icon size={size} strokeWidth={1.75} aria-label={domain} />;
}

export function DomainTag({ domain }: { domain?: Domain }) {
  if (!domain) return null;
  return (
    <span className={styles.domain}>
      <DomainMark domain={domain} />
      {domain.charAt(0).toUpperCase() + domain.slice(1)}
    </span>
  );
}

const TONE_CLASS: Record<Tone, string> = { good: styles.toneGood, bad: styles.toneBad, neutral: styles.toneNeutral };

/** Plain-text change coloured by meaning. */
export function Delta({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cx(styles.delta, TONE_CLASS[tone])}>{children}</span>;
}

/**
 * Change pill: arrow for direction, colour for meaning. Direction and meaning are separate —
 * a rising return rate is an up arrow in the "bad" tone.
 */
export function DeltaPill({
  tone,
  direction,
  children,
  context,
}: {
  tone: Tone;
  direction: "up" | "down" | "flat";
  children: React.ReactNode;
  context?: string;
}) {
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;
  const meaning = tone === "good" ? "favourable" : tone === "bad" ? "unfavourable" : "neutral";
  return (
    <span className={styles.deltaWrap}>
      <span className={cx(styles.deltaPill, TONE_CLASS[tone])}>
        <Icon size={14} strokeWidth={2} aria-hidden />
        <span className="num">{children}</span>
        <span className="visually-hidden">, {meaning}</span>
      </span>
      {context && <span className={styles.deltaContext}>{context}</span>}
    </span>
  );
}

export function EmptyState({
  title,
  icon: Icon,
  children,
  action,
  tone = "default",
}: {
  title: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div className={cx(styles.empty, tone === "error" && styles.emptyError)}>
      {Icon && (
        <span className={styles.emptyIcon} aria-hidden>
          <Icon size={20} strokeWidth={1.75} />
        </span>
      )}
      <strong className={styles.emptyTitle}>{title}</strong>
      {children && <div className={styles.emptyBody}>{children}</div>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";
const BUTTON_CLASS: Record<ButtonVariant, string> = {
  primary: styles.button,
  secondary: styles.buttonSecondary,
  ghost: styles.buttonGhost,
};

/** Class names for a native <button> that should look like ButtonLink. */
export function buttonClass(variant: ButtonVariant = "primary", size: "md" | "sm" = "md") {
  return cx(BUTTON_CLASS[variant], size === "sm" && styles.buttonSm);
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  icon: Icon,
  size = "md",
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  size?: "md" | "sm";
}) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {Icon && <Icon size={16} strokeWidth={2} aria-hidden />}
      {children}
    </Link>
  );
}

/** ButtonLink's look for an action with no destination — e.g. resetting client-side filter
 * state. Render from a client component. */
export function Button({
  onClick,
  children,
  variant = "primary",
  icon: Icon,
  size = "md",
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  size?: "md" | "sm";
}) {
  return (
    <button type="button" onClick={onClick} className={buttonClass(variant, size)}>
      {Icon && <Icon size={16} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
}

export function ChipLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  // prefetch={false}: these chips switch a searchParam on a fully dynamic page (e.g. the
  // dashboard's domain tabs) — every click needs a fresh server render, and Link's default
  // prefetch can otherwise serve a stale client Router Cache entry for the same pathname.
  return (
    <Link
      href={href}
      prefetch={false}
      className={active ? styles.chipActive : styles.chip}
      aria-current={active ? "true" : undefined}
    >
      {children}
    </Link>
  );
}

/** ChipLink's look for client-side state (no navigation) — e.g. filtering an already-fetched
 * list in memory, where a Link's URL-driven searchParam navigation would only add a same-page
 * round trip for no benefit. Render from a client component. */
export function ChipButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? styles.chipActive : styles.chip}
      aria-current={active ? "true" : undefined}
    >
      {children}
    </button>
  );
}

/** Segmented control made of links, so filters stay server-rendered. */
export function SegmentedLinks({
  items,
  label,
  stretch,
}: {
  items: { href: string; label: string; active: boolean }[];
  label: string;
  stretch?: boolean;
}) {
  return (
    <nav className={cx(styles.segmented, stretch && styles.segmentedStretch)} aria-label={label}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={it.active ? styles.segmentActive : styles.segment}
          aria-current={it.active ? "page" : undefined}
          scroll={false}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/** SegmentedLinks' look for client-side state (no navigation). Render from a client component. */
export function SegmentedButtons<T extends string>({
  items,
  value,
  onChange,
  label,
  stretch,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  stretch?: boolean;
}) {
  return (
    <div className={cx(styles.segmented, stretch && styles.segmentedStretch)} role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          className={cx(styles.segmentButton, it.value === value ? styles.segmentActive : styles.segment)}
          aria-pressed={it.value === value}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Metric key as a subtle mono tag that links to the metric's definition. */
export function MetricKey({ id }: { id: string }) {
  return (
    <Link href={`/metrics/${id}`} className={styles.metricKey} title={`Metric: ${id}`}>
      {id}
    </Link>
  );
}

/** Signal ID chip that links to the explain view. */
export function SignalChip({ id }: { id: string }) {
  return (
    <Link href={`/signals/${id}`} className={styles.signalChip} title={`Signal ${id}`}>
      {id}
    </Link>
  );
}

export function Skeleton({
  width = "100%",
  height = 14,
  radius,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}) {
  return <span className={cx(styles.skeleton, className)} style={{ width, height, borderRadius: radius }} aria-hidden />;
}

export { styles as uiStyles };

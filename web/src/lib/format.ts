// Display formatting. Pure functions, safe on server and client.
//
// One money format everywhere: "S$" prefix, true minus sign (−), and compact values at three
// significant figures (S$1.84M, S$412K, S$58.4K, S$8.2K) so precision never jumps between
// screens. Signed changes use explicit +/−; percentage-unit metrics move in "pts".

import type { MetricDirection, MetricUnit } from "./types";

const MINUS = "−";
const LOCALE = "en-SG";

const whole = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const compact3 = new Intl.NumberFormat(LOCALE, { notation: "compact", minimumSignificantDigits: 3, maximumSignificantDigits: 3 });
const compactAxis = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumSignificantDigits: 3 });
const oneDp = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

const sign = (v: number) => (v < 0 ? MINUS : "");

/** Compact number without currency: 1.84M, 412K, 9,162 → 9.16K. Values under 1,000 stay whole. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  return sign(value) + (abs < 1000 ? oneDp.format(abs) : compact3.format(abs));
}

/**
 * SGD money. `compact` (the default for anything ≥ S$10K on screen) gives S$412K; otherwise
 * whole dollars, S$186 / S$8,150.
 */
export function formatSGD(value: number, compact = false): string {
  const abs = Math.abs(value);
  const body = compact && abs >= 1000 ? compact3.format(abs) : whole.format(abs);
  return `${sign(value)}S$${body}`;
}

/** Money for display: compact from S$10K up, exact below. */
export function formatMoney(value: number): string {
  return formatSGD(value, Math.abs(value) >= 10_000);
}

/** Dollar impact reads as a loss or gain, never a bare negative: −S$8.2K / +S$1.1K. */
export function formatImpact(value: number): string {
  const s = formatSGD(Math.abs(value), true);
  return value < 0 ? `${MINUS}${s}` : `+${s}`;
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${sign(fraction)}${Math.abs(fraction * 100).toFixed(digits)}%`;
}

export function formatMetricValue(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "SGD":
      return formatMoney(value);
    case "percent":
      return formatPercent(value);
    case "ratio":
      return `${oneDp.format(value)}×`;
    case "days":
      return `${oneDp.format(value)} d`;
    case "units":
    case "count":
      return whole.format(value);
    default:
      return oneDp.format(value);
  }
}

/** Signed change label, e.g. "+12.4%" or "−3.1 pts" for percent-unit metrics. */
export function formatChange(current: number, previous: number, unit: MetricUnit): string {
  if (unit === "percent") {
    const pts = (current - previous) * 100;
    return `${pts >= 0 ? "+" : MINUS}${Math.abs(pts).toFixed(1)} pts`;
  }
  if (previous === 0) return "—";
  const pct = (current - previous) / Math.abs(previous);
  return `${pct >= 0 ? "+" : MINUS}${Math.abs(pct * 100).toFixed(1)}%`;
}

export type Tone = "good" | "bad" | "neutral";

/** Whether a move is good news, given the metric's direction. */
export function changeTone(current: number, previous: number, direction: MetricDirection): Tone {
  if (current === previous || direction === "context_dependent") return "neutral";
  const up = current > previous;
  return up === (direction === "higher_is_better") ? "good" : "bad";
}

/** Short form for chart axes: S$82K, 38%, 14d. */
export function formatAxis(value: number, unit: MetricUnit): string {
  if (unit === "SGD") return `${sign(value)}S$${Math.abs(value) < 1000 ? whole.format(Math.abs(value)) : compactAxis.format(Math.abs(value))}`;
  if (unit === "percent") return `${+(value * 100).toFixed(1)}%`;
  if (unit === "days") return `${Math.round(value)}d`;
  return formatCompact(value);
}

export function formatDeviation(deviation: number): string {
  return `${deviation >= 0 ? "+" : MINUS}${Math.abs(deviation * 100).toFixed(0)}%`;
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}

export function formatDimensions(dims: Record<string, string>): string {
  const entries = Object.entries(dims);
  return entries.length ? entries.map(([k, v]) => `${humanize(k)}: ${v}`).join(" · ") : "All";
}

export function humanize(id: string): string {
  const s = id.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00+08:00`).toLocaleDateString(LOCALE, {
    timeZone: "Asia/Singapore",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "Tue, 22 Sep" — list rows. */
export function formatShortDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00+08:00`).toLocaleDateString(LOCALE, {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

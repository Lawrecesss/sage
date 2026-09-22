// Display formatting. Pure functions, safe on server and client.

import type { MetricDirection, MetricUnit } from "./types";

const sgd = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });
const sgdCompact = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat("en-SG", { maximumFractionDigits: 1 });

export function formatSGD(value: number, compact = false): string {
  return (compact ? sgdCompact : sgd).format(value);
}

/** Dollar impact reads as a loss or gain, never a bare negative. */
export function formatImpact(value: number): string {
  const s = formatSGD(Math.abs(value), true);
  return value < 0 ? `−${s}` : `+${s}`;
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatMetricValue(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "SGD":
      return formatSGD(value, Math.abs(value) >= 100_000);
    case "percent":
      return formatPercent(value);
    case "ratio":
      return `${num.format(value)}×`;
    case "days":
      return `${num.format(value)} d`;
    default:
      return num.format(value);
  }
}

/** Signed change label, e.g. "+12.4%" or "−3.1 pts" for percent-unit metrics. */
export function formatChange(current: number, previous: number, unit: MetricUnit): string {
  if (unit === "percent") {
    const pts = (current - previous) * 100;
    return `${pts >= 0 ? "+" : "−"}${Math.abs(pts).toFixed(1)} pts`;
  }
  if (previous === 0) return "—";
  const pct = (current - previous) / Math.abs(previous);
  return `${pct >= 0 ? "+" : "−"}${formatPercent(Math.abs(pct))}`;
}

/** Whether a move is good news, given the metric's direction. */
export function changeTone(current: number, previous: number, direction: MetricDirection): "good" | "bad" | "neutral" {
  if (current === previous || direction === "context_dependent") return "neutral";
  const up = current > previous;
  return up === (direction === "higher_is_better") ? "good" : "bad";
}

/** Short form for chart axes: $82K, 38%, 14d. */
export function formatAxis(value: number, unit: MetricUnit): string {
  if (unit === "SGD") return sgdCompact.format(value);
  if (unit === "percent") return `${Math.round(value * 100)}%`;
  if (unit === "days") return `${Math.round(value)}d`;
  return new Intl.NumberFormat("en-SG", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatDeviation(deviation: number): string {
  return `${deviation >= 0 ? "+" : "−"}${formatPercent(Math.abs(deviation), 0)}`;
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
  return new Date(iso).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00+08:00`).toLocaleDateString("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

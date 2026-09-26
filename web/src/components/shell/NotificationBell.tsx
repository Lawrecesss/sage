"use client";

// The top-right bell: critical (high-severity) and other anomalies from recent report runs
// (GET /api/notifications, see lib/notifications.ts), with a badge for the ones not yet seen.
// Clicking one marks it seen and opens the report run it came from.
//
// "Seen" lives in localStorage, not the database: there are no user accounts yet, so there's
// nobody server-side to mark it seen *for*. The feed is re-read every POLL_MS and whenever the
// tab regains focus, so a scheduled report's anomalies show up without a reload.

import { AlertTriangle, Bell, CheckCheck, TrendingDown, TrendingUp, type LucideIcon, Split } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SeverityDot } from "@/components/ui";
import type { Anomaly, AnomalyNotification } from "@/lib/types";
import styles from "./shell.module.css";

const POLL_MS = 60_000;
const SEEN_KEY = "sage.notifications.seen";

/** Fired on window when a notification asks for a report while the Reports page is already
 * open — ReportsExplorer switches to it in place (see there for why that isn't a navigation). */
export const OPEN_REPORT_EVENT = "sage:open-report";

// Every page renders its own TopBar, so the bell remounts on each navigation; starting from the
// last feed it saw keeps the badge from blinking out while the refetch is in flight.
let lastFeed: AnomalyNotification[] | null = null;

const KIND_ICON: Record<Anomaly["kind"], LucideIcon> = { divergence: Split, surge: TrendingUp, drop: TrendingDown };

function readSeen(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {}
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotificationBell() {
  const [items, setItems] = useState<AnomalyNotification[] | null>(lastFeed);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      lastFeed = await res.json();
      setItems(lastFeed);
    } catch {} // a missed poll just means the next one catches up
  }, []);

  useEffect(() => {
    setSeen(readSeen());
    load();
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => document.visibilityState === "visible" && load();
    const onStorage = (e: StorageEvent) => e.key === SEEN_KEY && setSeen(readSeen());
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [load]);

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** Saves `ids` as seen, dropping remembered ids whose report is gone so the list can't grow forever. */
  const markSeen = (ids: string[]) => {
    const live = new Set((items ?? []).map((n) => n.id));
    const next = new Set([...seen].filter((id) => live.has(id)));
    for (const id of ids) next.add(id);
    setSeen(next);
    writeSeen(next);
  };

  const openReport = (n: AnomalyNotification) => {
    markSeen([n.id]);
    setOpen(false);
    if (pathname === "/reports") {
      window.dispatchEvent(new CustomEvent(OPEN_REPORT_EVENT, { detail: n.reportId }));
    } else {
      router.push(`/reports?report=${encodeURIComponent(n.reportId)}`);
    }
  };

  const list = items ?? [];
  const unseen = list.filter((n) => !seen.has(n.id));
  const unseenCritical = unseen.filter((n) => n.critical).length;
  const label =
    unseen.length === 0
      ? "Notifications"
      : `Notifications, ${unseen.length} unseen${unseenCritical ? `, ${unseenCritical} critical` : ""}`;

  return (
    <div className={styles.bell} ref={rootRef}>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
      >
        <Bell size={18} strokeWidth={1.75} aria-hidden />
        {unseen.length > 0 && (
          <span className={unseenCritical ? styles.bellBadgeCritical : styles.bellBadge} aria-hidden>
            {unseen.length > 9 ? "9+" : unseen.length}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.bellPanel} role="dialog" aria-label="Notifications">
          <div className={styles.bellHead}>
            <span className={styles.bellTitle}>Notifications</span>
            {unseen.length > 0 && (
              <button type="button" className={styles.bellMarkAll} onClick={() => markSeen(list.map((n) => n.id))}>
                <CheckCheck size={14} strokeWidth={2} aria-hidden />
                Mark all as seen
              </button>
            )}
          </div>

          {items === null ? (
            <p className={styles.bellEmpty}>Loading…</p>
          ) : list.length === 0 ? (
            <p className={styles.bellEmpty}>No anomalies flagged in recent reports.</p>
          ) : (
            <ul className={styles.bellList}>
              {list.map((n) => {
                const isUnseen = !seen.has(n.id);
                const Icon = n.critical ? AlertTriangle : KIND_ICON[n.kind];
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={isUnseen ? styles.bellItemUnseen : styles.bellItem}
                      onClick={() => openReport(n)}
                    >
                      <span className={n.critical ? styles.bellIconCritical : styles.bellIcon} aria-hidden>
                        <Icon size={16} strokeWidth={2} />
                      </span>
                      <span className={styles.bellBody}>
                        <span className={styles.bellItemTop}>
                          <span className={n.critical ? styles.bellTagCritical : styles.bellTag}>
                            {n.critical ? "Critical" : "Anomaly"}
                          </span>
                          <SeverityDot severity={n.severity} />
                          {isUnseen && <span className="visually-hidden">Unseen</span>}
                        </span>
                        <span className={styles.bellSummary}>{n.summary}</span>
                        <span className={styles.bellMeta}>
                          {n.reportTitle} · {timeAgo(n.generatedAt)}
                        </span>
                      </span>
                      {isUnseen && <span className={styles.bellUnseenDot} aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

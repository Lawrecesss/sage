"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NewChatLink } from "@/components/chat/NewChatLink";
import { ChatHistory } from "./ChatHistory";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./shell.module.css";

// `match` is the path prefix that marks an item active; Chat's href `/` redirects to a
// fresh `/chat/<sessionId>`, so it is active anywhere under `/chat`.
const NAV = [
  { href: "/", match: "/chat", label: "Chat", icon: ChatIcon, history: true },
  { href: "/reports", match: "/reports", label: "Reports", icon: ReportsIcon },
  { href: "/dashboard", match: "/dashboard", label: "Dashboard", icon: DashboardIcon },
];

const HISTORY_OPEN_KEY = "sage.chatHistoryOpen";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const pathname = usePathname();

  // Remember whether the chat history is expanded (read after mount: localStorage is client-only).
  useEffect(() => {
    try {
      if (localStorage.getItem(HISTORY_OPEN_KEY) === "false") setHistoryOpen(false);
    } catch {}
  }, []);

  function toggleHistory() {
    setHistoryOpen((open) => {
      try {
        localStorage.setItem(HISTORY_OPEN_KEY, String(!open));
      } catch {}
      return !open;
    });
  }
  const isActive = (match: string) => pathname === match || pathname.startsWith(`${match}/`);

  return (
    <aside className={styles.sidebar} data-collapsed={collapsed || undefined}>
      <NewChatLink className={styles.brand} title="Sage">
        <span className={styles.logo} aria-hidden>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="0" y="0" width="5" height="5" fill="currentColor" />
            <rect x="7" y="0" width="5" height="5" fill="currentColor" opacity="0.45" />
            <rect x="0" y="7" width="5" height="5" fill="currentColor" opacity="0.45" />
            <rect x="7" y="7" width="5" height="5" fill="currentColor" />
          </svg>
        </span>
        {!collapsed && <span className={styles.brandName}>SAGE</span>}
      </NewChatLink>

      <nav className={styles.nav} aria-label="Main">
        {NAV.map(({ href, match, label, icon: Icon, history }) => (
          <div key={href} className={styles.navRow} data-active={isActive(match) || undefined}>
            {href === "/" ? (
              // Chat starts a new session; see NewChatLink for why this isn't a <Link href="/">.
              <NewChatLink title={label} className={isActive(match) ? styles.navActive : styles.navLink}>
                <Icon />
                {!collapsed && <span>{label}</span>}
              </NewChatLink>
            ) : (
              <Link
                href={href}
                title={label}
                className={isActive(match) ? styles.navActive : styles.navLink}
                aria-current={isActive(match) ? "page" : undefined}
              >
                <Icon />
                {!collapsed && <span>{label}</span>}
              </Link>
            )}
            {history && !collapsed && (
              <button
                type="button"
                className={styles.navToggle}
                onClick={toggleHistory}
                aria-expanded={historyOpen}
                aria-label={historyOpen ? "Hide chat history" : "Show chat history"}
                title={historyOpen ? "Hide chat history" : "Show chat history"}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden
                  style={{ transform: historyOpen ? "rotate(90deg)" : undefined }}
                >
                  <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            )}
            {history && !collapsed && historyOpen && <ChatHistory />}
          </div>
        ))}
      </nav>

      <div className={styles.sidebarFoot}>
        <ThemeToggle collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={styles.collapseBtn}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: collapsed ? "rotate(180deg)" : undefined }}>
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          </svg>
        </button>
        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden>
            LC
          </span>
          {!collapsed && (
            <span className={styles.userMeta}>
              <span className={styles.userName}>Lian &amp; Co.</span>
              <span className={styles.userRole}>Owner</span>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

/* Icons: 16px, 1.3 stroke, currentColor. */

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 2h12v9H9l-3 3v-3H2V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 6h6M5 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.5 1.5h6l3 3v10h-9v-13z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.5 1.5v3h3M5.5 8h5M5.5 10.5h5M5.5 13h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

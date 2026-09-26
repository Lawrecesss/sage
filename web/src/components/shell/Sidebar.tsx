"use client";

import {
  ChevronRight,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NewChatLink } from "@/components/chat/NewChatLink";
import { ChatHistory } from "./ChatHistory";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./shell.module.css";

// `match` is the path prefix that marks an item active; Chat's href `/` redirects to a
// fresh `/chat/<sessionId>`, so it is active anywhere under `/chat`.
const NAV: { href: string; match: string; label: string; icon: LucideIcon; history?: boolean }[] = [
  { href: "/", match: "/chat", label: "Chat", icon: MessageSquare, history: true },
  { href: "/reports", match: "/reports", label: "Reports", icon: FileText },
  { href: "/dashboard", match: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const COLLAPSE_KEY = "sage.sidebar";
const HISTORY_OPEN_KEY = "sage.chatHistoryOpen";

/**
 * Three layouts from one component: full sidebar (≥1024px, user-collapsible), icon rail
 * (768–1023px, always) and a bottom tab bar on phones. The rail and tab bar are pure CSS;
 * the chat history only shows in the full sidebar.
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const pathname = usePathname();
  const isActive = (match: string) => pathname === match || pathname.startsWith(`${match}/`);

  // Read after mount: localStorage is client-only.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
      if (localStorage.getItem(HISTORY_OPEN_KEY) === "false") setHistoryOpen(false);
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  }

  function toggleHistory() {
    setHistoryOpen((open) => {
      try {
        localStorage.setItem(HISTORY_OPEN_KEY, String(!open));
      } catch {}
      return !open;
    });
  }

  return (
    <>
      <aside className={styles.sidebar} data-collapsed={collapsed || undefined}>
        <NewChatLink className={styles.brand} title="Sage · new chat">
          <Logo />
          <span className={styles.brandName}>Sage</span>
        </NewChatLink>

        <nav className={styles.nav} aria-label="Main">
          {NAV.map(({ href, match, label, icon: Icon, history }) => {
            const active = isActive(match);
            const className = active ? styles.navActive : styles.navLink;
            const content = (
              <>
                <Icon size={18} strokeWidth={1.75} aria-hidden />
                <span className={styles.navLabel}>{label}</span>
              </>
            );
            return (
              <div key={href} className={styles.navRow}>
                {href === "/" ? (
                  // Chat starts a new session; see NewChatLink for why this isn't a <Link href="/">.
                  <NewChatLink title={label} className={className}>
                    {content}
                  </NewChatLink>
                ) : (
                  <Link href={href} title={label} className={className} aria-current={active ? "page" : undefined}>
                    {content}
                  </Link>
                )}
                {history && (
                  <button
                    type="button"
                    className={styles.navToggle}
                    onClick={toggleHistory}
                    aria-expanded={historyOpen}
                    aria-label={historyOpen ? "Hide chat history" : "Show chat history"}
                    title={historyOpen ? "Hide chat history" : "Show chat history"}
                  >
                    <ChevronRight size={14} strokeWidth={2} aria-hidden />
                  </button>
                )}
                {history && historyOpen && !collapsed && <ChatHistory />}
              </div>
            );
          })}
        </nav>

        <div className={styles.sidebarFoot}>
          <div className={styles.org} title="Lian & Co. · Owner · read-only access">
            <span className={styles.avatar} aria-hidden>
              LC
            </span>
            <span className={styles.orgMeta}>
              <span className={styles.orgName}>Lian &amp; Co.</span>
              <span className={styles.orgRole}>Owner</span>
            </span>
          </div>
          <div className={styles.footActions}>
            <ThemeToggle />
            <button
              type="button"
              onClick={toggleCollapsed}
              className={`${styles.iconBtn} ${styles.collapseBtn}`}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden />
              ) : (
                <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden />
              )}
            </button>
          </div>
        </div>
      </aside>

      <nav className={styles.bottomNav} aria-label="Main">
        {NAV.map(({ href, match, label, icon: Icon }) => {
          const active = isActive(match);
          const className = active ? styles.tabActive : styles.tab;
          const content = (
            <>
              <Icon size={20} strokeWidth={1.75} aria-hidden />
              <span>{label}</span>
            </>
          );
          return href === "/" ? (
            <NewChatLink key={href} className={className}>
              {content}
            </NewChatLink>
          ) : (
            <Link key={href} href={href} className={className} aria-current={active ? "page" : undefined}>
              {content}
            </Link>
          );
        })}
        <ThemeToggle className={styles.tab} withLabel />
      </nav>
    </>
  );
}

function Logo() {
  return (
    <span className={styles.logo} aria-hidden>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5c3.6 0 6.5 2.9 6.5 6.5S11.6 14.5 8 14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 14.5C4.4 14.5 1.5 11.6 1.5 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
        <circle cx="8" cy="8" r="2.25" fill="currentColor" />
      </svg>
    </span>
  );
}

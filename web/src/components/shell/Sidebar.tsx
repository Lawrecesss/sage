"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./shell.module.css";

const NAV = [
  { href: "/", label: "Chat", icon: ChatIcon, exact: true },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <aside className={styles.sidebar} data-collapsed={collapsed || undefined}>
      <Link href="/" className={styles.brand} title="Sage">
        <span className={styles.logo} aria-hidden>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="0" y="0" width="5" height="5" fill="currentColor" />
            <rect x="7" y="0" width="5" height="5" fill="currentColor" opacity="0.45" />
            <rect x="0" y="7" width="5" height="5" fill="currentColor" opacity="0.45" />
            <rect x="7" y="7" width="5" height="5" fill="currentColor" />
          </svg>
        </span>
        {!collapsed && <span className={styles.brandName}>SAGE</span>}
      </Link>

      <nav className={styles.nav} aria-label="Main">
        {NAV.map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            title={label}
            className={isActive(href, exact) ? styles.navActive : styles.navLink}
            aria-current={isActive(href, exact) ? "page" : undefined}
          >
            <Icon />
            {!collapsed && <span>{label}</span>}
          </Link>
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

function HistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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

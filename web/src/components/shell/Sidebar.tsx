"use client";

import { History, LayoutDashboard, MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./shell.module.css";

const NAV = [
  { href: "/", label: "Chat", icon: MessageSquare, exact: true },
  { href: "/history", label: "History", icon: History },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const COLLAPSE_KEY = "sage.sidebar";

/**
 * Three layouts from one component: full sidebar (≥1024px, user-collapsible), icon rail
 * (768–1023px, always) and a bottom tab bar on phones. The rail and tab bar are pure CSS.
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
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

  return (
    <>
      <aside className={styles.sidebar} data-collapsed={collapsed || undefined}>
        <Link href="/" className={styles.brand} aria-label="Sage home">
          <Logo />
          <span className={styles.brandName}>Sage</span>
        </Link>

        <nav className={styles.nav} aria-label="Main">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={active ? styles.navActive : styles.navLink}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden />
                <span className={styles.navLabel}>{label}</span>
              </Link>
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
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={active ? styles.tabActive : styles.tab}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden />
              <span>{label}</span>
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

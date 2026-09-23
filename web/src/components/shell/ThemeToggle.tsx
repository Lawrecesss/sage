"use client";

import { useEffect, useState } from "react";
import styles from "./shell.module.css";

type Theme = "light" | "dark";

/** Runs before paint so the stored theme is applied without a flash. See layout.tsx. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("sage.theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) ?? "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("sage.theme", next);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={styles.themeToggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 3a4 4 0 010 8V3z" fill="currentColor" />
      </svg>
      {!collapsed && <span>{theme === "dark" ? "Dark" : "Light"}</span>}
    </button>
  );
}

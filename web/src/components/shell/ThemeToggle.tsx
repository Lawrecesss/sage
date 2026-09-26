"use client";

import { Moon, Sun } from "lucide-react";
import styles from "./shell.module.css";

type Theme = "light" | "dark";

/** Runs before paint so the stored theme is applied without a flash. See layout.tsx. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("sage.theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

/**
 * Icon button. Both icons render and CSS picks one from <html data-theme>, so the button is
 * right on first paint without waiting for hydration.
 */
export function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  function toggle() {
    const current = (document.documentElement.dataset.theme as Theme) ?? "light";
    const next: Theme = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("sage.theme", next);
    } catch {}
  }

  return (
    <button type="button" onClick={toggle} className={className ?? styles.iconBtn} aria-label="Toggle colour theme" title="Toggle theme">
      <Sun className={styles.whenDark} size={18} strokeWidth={1.75} aria-hidden />
      <Moon className={styles.whenLight} size={18} strokeWidth={1.75} aria-hidden />
      {withLabel && <span>Theme</span>}
    </button>
  );
}

import styles from "./shell.module.css";

/**
 * Page header. The title and its one-line description stack on the left; `controls`
 * (tabs, filters) sit beside them on wide screens and wrap below on narrow ones; `actions`
 * stay on the right. Actions are page-specific — navigation lives in the sidebar only.
 */
export function TopBar({
  title,
  subtitle,
  tabs,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: React.ReactNode;
  tabs?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarTitle}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
      </div>
      {tabs && <div className={styles.topbarControls}>{tabs}</div>}
      {actions && <div className={styles.topbarRight}>{actions}</div>}
    </header>
  );
}

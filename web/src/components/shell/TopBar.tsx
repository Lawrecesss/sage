import styles from "./shell.module.css";

/** Fixed-height page header, mirroring the sidebar's 56px brand row. */
export function TopBar({
  title,
  subtitle,
  tabs,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  tabs?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {tabs}
        {subtitle && <span className={styles.pageSubtitle}>{subtitle}</span>}
      </div>
      {actions && <div className={styles.topbarRight}>{actions}</div>}
    </div>
  );
}

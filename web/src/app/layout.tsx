import type { Metadata } from "next";
import { Sidebar } from "@/components/shell/Sidebar";
import { THEME_INIT_SCRIPT } from "@/components/shell/ThemeToggle";
import styles from "@/components/shell/shell.module.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sage", template: "%s · Sage" },
  description: "Agentic monitoring for retail and e-commerce SMEs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <div className={styles.layout}>
          <Sidebar />
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}

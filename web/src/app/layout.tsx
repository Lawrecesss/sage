import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/shell/Sidebar";
import { THEME_INIT_SCRIPT } from "@/components/shell/ThemeToggle";
import styles from "@/components/shell/shell.module.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Sage", template: "%s · Sage" },
  description: "Agentic monitoring for retail and e-commerce SMEs",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#131312" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
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

// The Reports page's detail view: the same executive-summary callout + KPI strip + visual-
// breakdown the downloadable PDF/Excel exports lead with (see lib/report-export/{report-view,
// pdf,xlsx}.ts), built from the exact same `buildReportView` — so what's on screen and what
// downloads never disagree about a report's structure or duplicate a table that's already
// shown as a chart. The rest of the reply still renders through MessageBlocks: `bodyBlocks`
// hands back plain markdown text, re-serialized by `buildReportView`, so it keeps going through
// the same react-markdown pipeline (signal chips, GFM tables, charts) instead of a second
// hand-rolled renderer.

import { Delta } from "@/components/ui";
import type { Tone } from "@/lib/format";
import { MessageBlocks } from "@/components/chat/MessageBlocks";
import type { InlineRun } from "@/lib/report-export/markdown-lite";
import { buildReportView } from "@/lib/report-export/report-view";
import type { ReportKpi } from "@/lib/report-export/kpis";
import type { ContentBlock } from "@/lib/types";
import styles from "./reports.module.css";

const TONE_FOR: Record<NonNullable<ReportKpi["deltaDirection"]>, Tone> = { up: "good", down: "bad", flat: "neutral" };

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, i) => (r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>))}
    </>
  );
}

export function ReportInsights({ title, blocks }: { title: string; blocks: ContentBlock[] }) {
  const { lead, kpis, autoVisuals, bodyBlocks } = buildReportView(title, blocks);

  return (
    <>
      {lead && lead.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryLabel}>Executive summary</div>
          <p className={styles.summaryText}>
            <Runs runs={lead} />
          </p>
        </div>
      )}

      {kpis.length > 0 && (
        <div className={styles.kpiSection}>
          <div className={styles.kpiHeading}>Key metrics</div>
          <div className={styles.kpiGrid}>
            {kpis.map((kpi, i) => (
              <div className={styles.kpiCard} key={i}>
                <span className={styles.kpiCardLabel}>{kpi.label}</span>
                <span className={styles.kpiCardValue}>{kpi.value}</span>
                {kpi.deltaLabel && (
                  <Delta tone={kpi.deltaDirection ? TONE_FOR[kpi.deltaDirection] : "neutral"}>{kpi.deltaLabel}</Delta>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {autoVisuals.length > 0 && (
        <div className={styles.kpiSection}>
          <div className={styles.kpiHeading}>Visual breakdown</div>
          <div className={styles.visualsGrid}>
            <MessageBlocks blocks={autoVisuals} />
          </div>
        </div>
      )}

      <MessageBlocks blocks={bodyBlocks} />
    </>
  );
}

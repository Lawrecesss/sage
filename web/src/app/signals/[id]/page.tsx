import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart } from "@/components/charts/LineChart";
import { TopBar } from "@/components/shell/TopBar";
import shell from "@/components/shell/shell.module.css";
import styles from "@/components/signals/signals.module.css";
import { ButtonLink, Card, DomainTag, MetricKey, StatusBadge } from "@/components/ui";
import { getMetric, getMetricSeries, getSignal } from "@/lib/data";
import { resolveTenantIdForPage } from "@/lib/tenant";
import {
  formatDateTime,
  formatDeviation,
  formatDimensions,
  formatImpact,
  formatMetricValue,
  humanize,
} from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).id };
}

export default async function SignalPage({ params }: Props) {
  const { id } = await params;
  const tenantId = await resolveTenantIdForPage();
  const signal = await getSignal(tenantId, id);
  if (!signal) notFound();

  const [metric, series] = await Promise.all([
    getMetric(signal.metric_id),
    getMetricSeries(tenantId, signal.metric_id, signal.dimensions),
  ]);
  const unit = metric?.unit ?? "units";
  const label = metric?.label ?? signal.metric_id;

  return (
    <>
      <TopBar
        title={label}
        eyebrow={
          <>
            <Link href="/signals">Signals</Link> / <span className="mono">{signal.signal_id}</span>
          </>
        }
        subtitle={formatDimensions(signal.dimensions)}
        actions={
          <ButtonLink href={`/?q=${encodeURIComponent(`/explain ${signal.signal_id}`)}`}>Ask Sage why</ButtonLink>
        }
      />

      <div className={`${shell.page} ${styles.stack}`}>
        <div className={styles.detailGrid}>
          <Card>
            <div className={styles.statLabel}>Observed</div>
            <div className={`${styles.statValue} num`}>{formatMetricValue(signal.observed, unit)}</div>
          </Card>
          <Card>
            <div className={styles.statLabel}>Expected</div>
            <div className={`${styles.statValue} num`}>{formatMetricValue(signal.expected, unit)}</div>
          </Card>
          <Card>
            <div className={styles.statLabel}>Deviation</div>
            <div className={`${styles.statValue} num`}>{formatDeviation(signal.deviation)}</div>
          </Card>
          <Card>
            <div className={styles.statLabel}>Est. impact</div>
            <div className={`${styles.statValue} num`} style={{ color: signal.dollar_impact_est < 0 ? "var(--negative)" : "var(--positive)" }}>
              {formatImpact(signal.dollar_impact_est)}
            </div>
          </Card>
        </div>

        <Card title="Trend">
          <LineChart points={series.points} unit={unit} label={`${label}, observed vs expected`} />
        </Card>

        <Card title="Details">
          <dl className={styles.facts}>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={signal.status} />
            </dd>
            <dt>Domain</dt>
            <dd>
              <DomainTag domain={metric?.owner_domain} />
            </dd>
            <dt>Metric</dt>
            <dd>
              <MetricKey id={signal.metric_id} />
            </dd>
            <dt>Detector</dt>
            <dd>{humanize(signal.detector)}</dd>
            <dt>Score</dt>
            <dd className="num">{signal.score.toFixed(2)}</dd>
            <dt>Period</dt>
            <dd>
              {signal.period} ({signal.grain})
            </dd>
            <dt>Detected</dt>
            <dd>{formatDateTime(signal.detected_at)}</dd>
            {metric?.benchmark && (
              <>
                <dt>Benchmark</dt>
                <dd>{metric.benchmark}</dd>
              </>
            )}
          </dl>
        </Card>
      </div>
    </>
  );
}

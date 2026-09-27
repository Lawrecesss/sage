import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart } from "@/components/charts/LineChart";
import { TopBar } from "@/components/shell/TopBar";
import shell from "@/components/shell/shell.module.css";
import styles from "@/components/metrics/metrics.module.css";
import { ButtonLink, Card, DomainTag } from "@/components/ui";
import { getMetric, getMetricSeries } from "@/lib/data";
import { humanize } from "@/lib/format";
import { resolveTenantIdForPage } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const metric = await getMetric((await params).id);
  return { title: metric?.label ?? "Metric" };
}

export default async function MetricPage({ params }: Props) {
  const { id } = await params;
  const metric = await getMetric(id);
  if (!metric) notFound();

  const tenantId = await resolveTenantIdForPage();
  const series = await getMetricSeries(tenantId, metric.id);

  return (
    <>
      <TopBar
        title={metric.label}
        eyebrow={
          <>
            <Link href="/metrics">Metrics</Link> / <span className="mono">{metric.id}</span>
          </>
        }
        actions={
          <ButtonLink href={`/?q=${encodeURIComponent(`How is ${metric.label} trending, and why?`)}`}>Ask Sage</ButtonLink>
        }
      />

      <div className={`${shell.page} ${styles.stack}`}>
        <Card>
          <p style={{ marginTop: 0 }}>{metric.description}</p>
          <dl className={styles.facts}>
            <dt>Domain</dt>
            <dd>
              <DomainTag domain={metric.owner_domain} />
            </dd>
            <dt>Unit</dt>
            <dd>{metric.unit}</dd>
            <dt>Direction</dt>
            <dd>{humanize(metric.direction)}</dd>
            {metric.benchmark && (
              <>
                <dt>Benchmark</dt>
                <dd>{metric.benchmark}</dd>
              </>
            )}
            <dt>Grain</dt>
            <dd>{metric.grain.join(", ")}</dd>
            <dt>Dimensions</dt>
            <dd>{metric.dimensions.length ? metric.dimensions.join(", ") : "—"}</dd>
          </dl>
        </Card>

        <Card title="Last 30 days">
          <LineChart points={series.points} unit={metric.unit} label={`${metric.label}, last 30 days`} />
        </Card>
      </div>
    </>
  );
}

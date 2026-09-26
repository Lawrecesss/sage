import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { TopBar } from "@/components/shell/TopBar";
import shell from "@/components/shell/shell.module.css";
import { SignalFilters } from "@/components/signals/SignalFilters";
import { SignalTable } from "@/components/signals/SignalTable";
import { Card, EmptyState } from "@/components/ui";
import { listMetrics, listSignals } from "@/lib/data";
import { resolveTenantForPage } from "@/lib/tenant";
import type { Domain, SignalStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Signals" };
export const dynamic = "force-dynamic";

const STATUSES: SignalStatus[] = ["open", "acknowledged", "resolved"];
const DOMAINS: Domain[] = ["sales", "inventory", "accounting"];

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; domain?: string }>;
}) {
  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status);
  const domain = DOMAINS.find((d) => d === params.domain);
  const { tenantId } = await resolveTenantForPage();

  const [signals, metrics] = await Promise.all([listSignals(tenantId, { status, domain }), listMetrics()]);
  const byId = new Map(metrics.map((m) => [m.id, m]));

  return (
    <>
      <TopBar title="Signals" subtitle="Detector output, highest score first. Select a row to see why it fired." />
      <div className={shell.page}>
        <SignalFilters current={{ status, domain }} />
        <Card flush>
          {signals.length ? (
            <SignalTable signals={signals} metrics={byId} />
          ) : (
            <EmptyState title="No signals match" icon={SearchX}>
              Try clearing a filter.
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}

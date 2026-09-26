import type { Metadata } from "next";
import { TopBar } from "@/components/shell/TopBar";
import shell from "@/components/shell/shell.module.css";
import { SignalsExplorer } from "@/components/signals/SignalsExplorer";
import { listMetrics, listSignals } from "@/lib/data";
import { resolveTenantIdForPage } from "@/lib/tenant";
import type { Domain, SignalStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Signals" };
export const dynamic = "force-dynamic";

const STATUSES: SignalStatus[] = ["open", "acknowledged", "resolved"];
const DOMAINS: Domain[] = ["sales", "inventory", "accounting"];

/** Fetches every signal, unfiltered — status/domain filtering happens client-side in
 * SignalsExplorer (see its header comment for why). `listSignals` computes the full set in
 * memory regardless (lib/live.ts), so this isn't extra cost, just a higher `limit`. */
export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; domain?: string }>;
}) {
  const params = await searchParams;
  const tenantId = await resolveTenantIdForPage();

  const [signals, metrics] = await Promise.all([listSignals(tenantId, { limit: 500 }), listMetrics()]);

  return (
    <>
      <TopBar title="Signals" subtitle="Detector output, highest score first. Select a row to see why it fired." />
      <div className={shell.page}>
        <SignalsExplorer
          signals={signals}
          metrics={metrics}
          initialStatus={STATUSES.find((s) => s === params.status)}
          initialDomain={DOMAINS.find((d) => d === params.domain)}
        />
      </div>
    </>
  );
}

"use client";

// Status/domain filtering is client-side state, not URL search params — same reason as
// ReportsExplorer (see its header comment): same-pathname, param-only Link navigation silently
// no-ops on this Next.js version. `listSignals` already computes every signal in memory and
// filters/slices in JS (see lib/live.ts) rather than pushing a WHERE clause to SQL, so fetching
// the full set once and filtering here costs nothing extra.

import { useState } from "react";
import { SearchX } from "lucide-react";
import { SignalTable } from "@/components/signals/SignalTable";
import { Card, ChipButton, EmptyState } from "@/components/ui";
import styles from "./signals.module.css";
import type { Domain, Metric, Signal, SignalStatus } from "@/lib/types";

const STATUSES: SignalStatus[] = ["open", "acknowledged", "resolved"];
const DOMAINS: Domain[] = ["sales", "inventory", "accounting"];

export function SignalsExplorer({
  signals,
  metrics,
  initialStatus,
  initialDomain,
}: {
  signals: Signal[];
  metrics: Metric[];
  initialStatus?: SignalStatus;
  initialDomain?: Domain;
}) {
  const [status, setStatus] = useState<SignalStatus | undefined>(initialStatus);
  const [domain, setDomain] = useState<Domain | undefined>(initialDomain);
  const byId = new Map(metrics.map((m) => [m.id, m]));

  const filtered = signals.filter(
    (s) => (!status || s.status === status) && (!domain || byId.get(s.metric_id)?.owner_domain === domain),
  );

  const syncUrl = (nextStatus?: SignalStatus, nextDomain?: Domain) => {
    const qs = new URLSearchParams();
    if (nextStatus) qs.set("status", nextStatus);
    if (nextDomain) qs.set("domain", nextDomain);
    window.history.replaceState(null, "", `/signals${qs.size ? `?${qs}` : ""}`);
  };
  const selectStatus = (s?: SignalStatus) => {
    setStatus(s);
    syncUrl(s, domain);
  };
  const selectDomain = (d?: Domain) => {
    setDomain(d);
    syncUrl(status, d);
  };

  return (
    <>
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <span className="label">Status</span>
          <ChipButton active={!status} onClick={() => selectStatus(undefined)}>
            All
          </ChipButton>
          {STATUSES.map((s) => (
            <ChipButton key={s} active={status === s} onClick={() => selectStatus(s)}>
              {s}
            </ChipButton>
          ))}
        </div>
        <div className={styles.filterGroup}>
          <span className="label">Domain</span>
          <ChipButton active={!domain} onClick={() => selectDomain(undefined)}>
            All
          </ChipButton>
          {DOMAINS.map((d) => (
            <ChipButton key={d} active={domain === d} onClick={() => selectDomain(d)}>
              {d}
            </ChipButton>
          ))}
        </div>
      </div>

      <Card flush>
        {filtered.length ? (
          <SignalTable signals={filtered} metrics={byId} />
        ) : (
          <EmptyState title="No signals match" icon={SearchX}>
            Try clearing a filter.
          </EmptyState>
        )}
      </Card>
    </>
  );
}

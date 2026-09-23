// Filters are plain links that set search params, so the list stays a server component.

import { ChipLink } from "@/components/ui";
import styles from "./signals.module.css";

type Params = { status?: string; domain?: string };

const GROUPS: { key: keyof Params; label: string; options: string[] }[] = [
  { key: "status", label: "Status", options: ["open", "acknowledged", "resolved"] },
  { key: "domain", label: "Domain", options: ["sales", "inventory", "accounting"] },
];

function href(current: Params, key: keyof Params, value?: string): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, [key]: value })) if (v) next.set(k, v);
  const qs = next.toString();
  return qs ? `/signals?${qs}` : "/signals";
}

export function SignalFilters({ current }: { current: Params }) {
  return (
    <div className={styles.filters}>
      {GROUPS.map((g) => (
        <div key={g.key} className={styles.filterGroup}>
          <span className="label">{g.label}</span>
          <ChipLink href={href(current, g.key)} active={!current[g.key]}>
            All
          </ChipLink>
          {g.options.map((o) => (
            <ChipLink key={o} href={href(current, g.key, o)} active={current[g.key] === o}>
              {o}
            </ChipLink>
          ))}
        </div>
      ))}
    </div>
  );
}

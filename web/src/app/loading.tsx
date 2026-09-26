import shell from "@/components/shell/shell.module.css";
import { Skeleton } from "@/components/ui";

/** Generic page skeleton: header plus a stack of cards. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: "contents" }}>
      <div className={shell.topbar}>
        <div className={shell.topbarTitle}>
          <Skeleton width={120} height={24} />
          <Skeleton width={220} height={14} />
        </div>
      </div>
      <div className={shell.page} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={104} radius={12} />
          ))}
        </div>
        <Skeleton height={260} radius={12} />
        <Skeleton height={200} radius={12} />
      </div>
    </div>
  );
}

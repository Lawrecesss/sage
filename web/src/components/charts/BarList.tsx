// Horizontal ranked bars — the stand-in for a pie/donut. One measure, so one hue:
// every row is the same categorical slot, with the value labelled on each row.

export function BarList({
  rows,
  format,
}: {
  rows: { label: string; value: number }[];
  format: (v: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 12px" }} title={`${r.label}: ${format(r.value)}`}>
          <span style={{ fontSize: 12 }}>{r.label}</span>
          <span className="num" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {format(r.value)}
          </span>
          <span
            style={{
              gridColumn: "1 / -1",
              height: 6,
              background: "var(--surface-muted)",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                width: `${(r.value / max) * 100}%`,
                background: "var(--series-1)",
                borderRadius: "0 2px 2px 0",
              }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

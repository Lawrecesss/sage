// Legend primitives shared by every chart (server and client).

export const legendStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  fontSize: 12,
  color: "var(--text-muted)",
  marginTop: 12,
};

/** Legend entry: coloured mark, text in ink — never coloured text. */
export function Swatch({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={
          dashed
            ? { width: 14, height: 0, borderTop: `2px dashed ${color}`, display: "inline-block" }
            : { width: 10, height: 10, background: color, borderRadius: 3, display: "inline-block" }
        }
        aria-hidden
      />
      {label}
    </span>
  );
}

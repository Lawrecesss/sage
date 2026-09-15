// Root layout — STUB (structure only).
export const metadata = { title: "Sage", description: "An agentic monitoring layer for retail SMEs." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

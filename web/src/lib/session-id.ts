// Chat session ids. A session id is the conversation key (OpenClaw keeps history per
// session) and the `/chat/[sessionId]` URL segment. Safe on server and client.

// crypto.randomUUID() only exists in secure contexts (https, or http://localhost).
// getRandomValues has no such restriction, so fall back to it when serving over plain http.
export function newSessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Path for a chat session, optionally prefilling the input (`?q=`) and/or opening it grounded
 * in a saved report (`?report=`, see the Reports page's "Discuss in chat" and Chat.tsx's
 * `initialReportId`). */
export function chatPath(sessionId: string, q?: string, reportId?: string): string {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (reportId) qs.set("report", reportId);
  const suffix = qs.size ? `?${qs}` : "";
  return `/chat/${sessionId}${suffix}`;
}

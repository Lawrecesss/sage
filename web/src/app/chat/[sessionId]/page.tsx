import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chat } from "@/components/chat/Chat";
import { isValidSessionId } from "@/lib/agent-response";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chat" };

type Props = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ q?: string; report?: string }>;
};

/**
 * One conversation per URL. The session id is the OpenClaw conversation key, so reopening
 * the same URL continues the same conversation; `?q=` prefills the input, `?report=` grounds
 * the next turn in a saved report (Reports page's "Discuss in chat" — see Chat.tsx's
 * `initialReportId`). The page header (with "New chat") is rendered by Chat.
 */
export default async function ChatSessionPage({ params, searchParams }: Props) {
  const [{ sessionId }, { q, report }] = await Promise.all([params, searchParams]);
  // Same rule the API applies to `sessionId`, so a URL that renders can always be sent.
  if (!isValidSessionId(sessionId)) notFound();

  return (
    <Chat
      key={`${sessionId}:${q ?? ""}:${report ?? ""}`}
      sessionId={sessionId}
      initialInput={q?.slice(0, 4000) ?? ""}
      initialReportId={report}
    />
  );
}

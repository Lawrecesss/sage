import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chat } from "@/components/chat/Chat";
import { NewChatLink } from "@/components/chat/NewChatLink";
import { TopBar } from "@/components/shell/TopBar";
import { ButtonLink, uiStyles } from "@/components/ui";
import { isValidSessionId } from "@/lib/agent-response";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chat" };

type Props = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ q?: string }>;
};

/**
 * One conversation per URL. The session id is the OpenClaw conversation key, so reopening
 * the same URL continues the same conversation; `?q=` prefills the input.
 */
export default async function ChatSessionPage({ params, searchParams }: Props) {
  const [{ sessionId }, { q }] = await Promise.all([params, searchParams]);
  // Same rule the API applies to `sessionId`, so a URL that renders can always be sent.
  if (!isValidSessionId(sessionId)) notFound();

  return (
    <>
      <TopBar
        title="Chat"
        subtitle={`Session ${sessionId.slice(0, 8)} · read-only · answers cite metrics and signals`}
        actions={
          <>
            <NewChatLink className={uiStyles.buttonGhost}>New chat</NewChatLink>
            <ButtonLink href="/dashboard" variant="ghost">
              Dashboard
            </ButtonLink>
          </>
        }
      />
      <Chat key={`${sessionId}:${q ?? ""}`} sessionId={sessionId} initialInput={q?.slice(0, 4000) ?? ""} />
    </>
  );
}

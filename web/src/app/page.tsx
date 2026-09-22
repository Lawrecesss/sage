import { Chat } from "@/components/chat/Chat";
import { TopBar } from "@/components/shell/TopBar";
import { ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

/** `?q=` prefills the input — used by "Ask Sage about this" links across the app. */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <>
      <TopBar
        title="Chat"
        subtitle="Read-only · answers cite metrics and signals"
        actions={<ButtonLink href="/dashboard" variant="ghost">Dashboard</ButtonLink>}
      />
      <Chat key={q} initialInput={q?.slice(0, 4000) ?? ""} />
    </>
  );
}

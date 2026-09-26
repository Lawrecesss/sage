import { Chat } from "@/components/chat/Chat";

export const dynamic = "force-dynamic";

/** `?q=` prefills the input — used by "Ask Sage about this" links across the app. The page
 * header (with "New chat") is rendered by Chat, since it owns the conversation state. */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <Chat key={q} initialInput={q?.slice(0, 4000) ?? ""} />;
}

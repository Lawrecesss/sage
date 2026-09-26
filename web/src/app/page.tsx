import { redirect } from "next/navigation";
import { chatPath, newSessionId } from "@/lib/session-id";

export const dynamic = "force-dynamic";

/**
 * `/` starts a new conversation. middleware.ts normally redirects before this renders;
 * this is the fallback if the middleware matcher ever stops covering `/`.
 */
export default async function NewChat({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(chatPath(newSessionId(), q?.slice(0, 4000)));
}

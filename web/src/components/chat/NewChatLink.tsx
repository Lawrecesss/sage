"use client";

import { useRouter } from "next/navigation";
import { chatPath, newSessionId } from "@/lib/session-id";

/**
 * Starts a new chat session. The session id is generated at click time, in the browser:
 * a plain <Link href="/"> would let Next prefetch `/` and cache where middleware.ts redirected
 * it, so every later click would land in that same (by then non-empty) session. `href="/"`
 * stays as the fallback for no-JS, middle-click and "open in new tab".
 */
export function NewChatLink({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle new-tab / new-window clicks through the `/` redirect.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.push(chatPath(newSessionId()));
  }

  return (
    <a href="/" onClick={onClick} className={className} title={title}>
      {children}
    </a>
  );
}

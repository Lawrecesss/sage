"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NewChatLink } from "@/components/chat/NewChatLink";
import { type ChatSummary, deleteChat, listChats, subscribeChats } from "@/lib/chat-history";
import { useRunningSessions } from "@/lib/chat-runs";
import { chatPath, newSessionId } from "@/lib/session-id";
import styles from "./shell.module.css";

const DAY = 24 * 60 * 60 * 1000;

/** ChatGPT-style buckets, most recent first. Sessions with no known time land in "Older". */
function groupChats(chats: ChatSummary[]): { label: string; chats: ChatSummary[] }[] {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const buckets: { label: string; since: number; chats: ChatSummary[] }[] = [
    { label: "Today", since: startOfToday, chats: [] },
    { label: "Yesterday", since: startOfToday - DAY, chats: [] },
    { label: "Previous 7 days", since: startOfToday - 7 * DAY, chats: [] },
    { label: "Previous 30 days", since: startOfToday - 30 * DAY, chats: [] },
    { label: "Older", since: -Infinity, chats: [] },
  ];
  for (const c of chats) buckets.find((b) => c.updatedAt >= b.since)!.chats.push(c);
  return buckets.filter((b) => b.chats.length);
}

function timeLabel(updatedAt: number): string {
  if (!updatedAt) return "";
  const d = new Date(updatedAt);
  return Date.now() - updatedAt < DAY
    ? d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}

/** Past chat sessions, listed under the Chat nav item while it is expanded. */
export function ChatHistory() {
  const pathname = usePathname();
  const router = useRouter();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const running = useRunningSessions();

  // localStorage is client-only, so load after mount and follow changes from any tab.
  useEffect(() => {
    const refresh = () => setChats(listChats());
    refresh();
    return subscribeChats(refresh);
  }, []);

  const activeId = pathname.startsWith("/chat/") ? pathname.slice("/chat/".length) : null;

  function remove(chat: ChatSummary) {
    if (!window.confirm(`Delete “${chat.title}”?\n\nThis removes it from this browser's history.`)) return;
    deleteChat(chat.id);
    if (chat.id === activeId) router.push(chatPath(newSessionId()));
  }

  return (
    <div className={styles.history}>
      <NewChatLink className={styles.historyNew}>
        <Plus size={14} strokeWidth={2} aria-hidden />
        New chat
      </NewChatLink>

      {chats !== null && chats.length === 0 && <p className={styles.historyEmpty}>No past chats yet</p>}

      {chats &&
        groupChats(chats).map((group) => (
          <div key={group.label} className={styles.historyGroup}>
            <div className={styles.historyLabel}>{group.label}</div>
            <ul className={styles.historyList}>
              {group.chats.map((chat) => (
                <li key={chat.id} className={chat.id === activeId ? styles.historyItemActive : styles.historyItem}>
                  <Link
                    href={`/chat/${chat.id}`}
                    className={styles.historyLink}
                    title={chat.title}
                    aria-current={chat.id === activeId ? "page" : undefined}
                  >
                    <span className={styles.historyTitle}>{chat.title}</span>
                    <span className={styles.historyTime}>
                      {running.includes(chat.id) ? (
                        <span className={styles.historyRunning}>
                          <span className={styles.historyPulse} aria-hidden />
                          Generating…
                        </span>
                      ) : (
                        timeLabel(chat.updatedAt)
                      )}
                    </span>
                  </Link>
                  {/* No delete mid-answer: the finished reply would be saved straight back. */}
                  {!running.includes(chat.id) && (
                    <button
                      type="button"
                      className={styles.historyDelete}
                      onClick={() => remove(chat)}
                      aria-label={`Delete chat: ${chat.title}`}
                      title="Delete chat"
                    >
                      <X size={12} strokeWidth={2} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

// Browser-side chat history: the transcripts behind `/chat/<sessionId>` and the index the
// sidebar lists them from.
//
// OpenClaw keeps each conversation's history server-side (keyed by session id) but has no
// API to read it back, so the rendered transcript lives in this browser's localStorage:
//   sage.chat.<sessionId>  -> ChatMessage[]     the transcript
//   sage.chats             -> ChatSummary[]     one entry per session, for the sidebar
// Another browser sees an empty history, yet reopening a session URL there still continues
// the same server-side conversation. Client-only: every call is a no-op without localStorage.
//
// Titles start as the first question and are replaced by an agent-written summary of the
// conversation (POST /api/chat/title) once a turn completes; see refreshChatTitle.

import type { ChatMessage, ChatTitleRequest } from "@/lib/types";

export interface ChatSummary {
  id: string;
  title: string;
  /** True once `title` is an agent-written summary rather than the first question. */
  summarized?: boolean;
  updatedAt: number; // epoch ms of the last completed turn
  messageCount: number;
}

const INDEX_KEY = "sage.chats";
const TRANSCRIPT_PREFIX = "sage.chat.";
const CHANGE_EVENT = "sage:chats-changed";
const TITLE_MAX = 60;

const transcriptKey = (sessionId: string) => `${TRANSCRIPT_PREFIX}${sessionId}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function titleOf(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = first && first.role === "user" ? first.content.replace(/\s+/g, " ").trim() : "";
  if (!text) return "New chat";
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text;
}

function notify(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {}
}

export function loadTranscript(sessionId: string): ChatMessage[] {
  return readJson<ChatMessage[]>(transcriptKey(sessionId), []);
}

/** Saves a transcript and upserts its sidebar entry. Empty transcripts are not recorded. */
export function saveTranscript(sessionId: string, messages: ChatMessage[]): void {
  if (!messages.length) return;
  writeJson(transcriptKey(sessionId), messages);

  const all = readJson<ChatSummary[]>(INDEX_KEY, []);
  const prev = all.find((c) => c.id === sessionId);
  const index = all.filter((c) => c.id !== sessionId);
  index.push({
    id: sessionId,
    // Keep a summary once there is one; until then the first question stands in.
    title: prev?.summarized ? prev.title : titleOf(messages),
    summarized: prev?.summarized,
    updatedAt: Date.now(),
    messageCount: messages.length,
  });
  writeJson(INDEX_KEY, index);
  notify();
}

/** Sets a session's summary title. No-op if the chat was deleted meanwhile. */
function setChatTitle(sessionId: string, title: string): void {
  const index = readJson<ChatSummary[]>(INDEX_KEY, []);
  const entry = index.find((c) => c.id === sessionId);
  if (!entry) return;
  entry.title = title;
  entry.summarized = true;
  writeJson(INDEX_KEY, index);
  notify();
}

/**
 * Whether a completed turn should (re)title the chat: after the first answer, then every
 * third turn, so the title follows the conversation without a model call per message.
 */
export function shouldRetitle(messages: ChatMessage[]): boolean {
  const turns = messages.filter((m) => m.role === "user").length;
  return turns === 1 || turns % 3 === 0;
}

/**
 * Asks the agent to summarise the conversation into a sidebar title and stores it. Best-effort:
 * on any failure the previous title (the first question, or an older summary) stays.
 */
export async function refreshChatTitle(sessionId: string, messages: ChatMessage[]): Promise<void> {
  const transcript: ChatTitleRequest["transcript"] = messages
    .map((m) =>
      m.role === "user"
        ? { role: "user" as const, text: m.content }
        : {
            role: "assistant" as const,
            text: m.blocks
              .map((b) => (b.type === "markdown" ? b.text : ""))
              .join("\n")
              .trim(),
          },
    )
    .filter((t) => t.text);
  if (!transcript.length) return;
  try {
    const res = await fetch("/api/chat/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, transcript: transcript.slice(-12) } satisfies ChatTitleRequest),
    });
    if (!res.ok) return;
    const { title } = (await res.json()) as { title?: string };
    if (title) setChatTitle(sessionId, title);
  } catch {}
}

export function deleteChat(sessionId: string): void {
  try {
    localStorage.removeItem(transcriptKey(sessionId));
  } catch {}
  writeJson(
    INDEX_KEY,
    readJson<ChatSummary[]>(INDEX_KEY, []).filter((c) => c.id !== sessionId),
  );
  notify();
}

/**
 * Every saved session, most recent first. Transcripts saved before the index existed are
 * recovered from their `sage.chat.*` keys (with no known time, so they sort last).
 */
export function listChats(): ChatSummary[] {
  const index = readJson<ChatSummary[]>(INDEX_KEY, []);
  const known = new Set(index.map((c) => c.id));
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(TRANSCRIPT_PREFIX)) continue;
      const id = key.slice(TRANSCRIPT_PREFIX.length);
      if (known.has(id)) continue;
      const messages = loadTranscript(id);
      if (messages.length) index.push({ id, title: titleOf(messages), updatedAt: 0, messageCount: messages.length });
    }
  } catch {}
  return index.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Calls `onChange` when the history changes in this tab or another one. Returns unsubscribe. */
export function subscribeChats(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === INDEX_KEY || e.key.startsWith(TRANSCRIPT_PREFIX)) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

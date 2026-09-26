// Browser-side chat history: the transcripts behind `/chat/<sessionId>` and the index the
// sidebar lists them from.
//
// OpenClaw keeps each conversation's history server-side (keyed by session id) but has no
// API to read it back, so the rendered transcript lives in this browser's localStorage:
//   sage.chat.<sessionId>  -> ChatMessage[]     the transcript
//   sage.chats             -> ChatSummary[]     one entry per session, for the sidebar
// Another browser sees an empty history, yet reopening a session URL there still continues
// the same server-side conversation. Client-only: every call is a no-op without localStorage.

import type { ChatMessage } from "@/lib/types";

export interface ChatSummary {
  id: string;
  title: string;
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

  const index = readJson<ChatSummary[]>(INDEX_KEY, []).filter((c) => c.id !== sessionId);
  index.push({ id: sessionId, title: titleOf(messages), updatedAt: Date.now(), messageCount: messages.length });
  writeJson(INDEX_KEY, index);
  notify();
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

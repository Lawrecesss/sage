// Owns each chat session's messages and in-flight turn, outside any React component.
//
// A turn is one fetch that streams the agent's reply. If that fetch lived in the Chat
// component, switching to another session would unmount it and drop the reply mid-stream:
// coming back showed neither the question nor the answer. Here the stream keeps running
// across client-side navigation, and <Chat> just renders whatever this store holds for its
// session (useChatSession). Several sessions can be generating at once.
//
// Persistence (lib/chat-history.ts, localStorage) happens at two points: when a question is
// sent (so it survives even a full reload, with the answer marked `pending`) and when the
// answer completes. A full page reload does end any in-flight fetch; such an answer is then
// shown as interrupted rather than silently lost.

import { useSyncExternalStore } from "react";
import {
  loadTranscript,
  refreshChatTitle,
  saveTranscript,
  shouldRetitle,
  subscribeChats,
} from "@/lib/chat-history";
import { parseInput } from "@/lib/slash-commands";
import type { ChatEvent, ChatMessage, ContentBlock } from "@/lib/types";

export interface ChatSessionState {
  messages: ChatMessage[];
  /** A turn is streaming for this session right now (in this tab). */
  running: boolean;
}

const NDJSON = "application/x-ndjson";
const EMPTY: ChatSessionState = { messages: [], running: false };

const sessions = new Map<string, ChatSessionState>();
const listeners = new Set<() => void>();
let running: readonly string[] = [];

function emit(): void {
  running = [...sessions].filter(([, s]) => s.running).map(([id]) => id);
  for (const l of listeners) l();
}

function set(sessionId: string, next: ChatSessionState): void {
  sessions.set(sessionId, next);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A full reload or close aborts every in-flight fetch, which surfaces as a "network error".
// That is not a failed answer: keep what arrived so far, still marked `pending`, so the
// reloaded page shows it as interrupted instead of as an error.
let unloading = false;
if (typeof window !== "undefined") {
  // beforeunload fires as navigation starts, before the browser aborts the fetches (pagehide
  // comes too late for that); pagehide covers exits without beforeunload, e.g. mobile.
  const onLeave = () => {
    unloading = true;
    for (const [id, s] of sessions) if (s.running) saveTranscript(id, s.messages);
  };
  window.addEventListener("beforeunload", onLeave);
  window.addEventListener("pagehide", onLeave);
  // A bfcache restore brings the page back alive; its fetches are gone but the flag must reset.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) unloading = false;
  });
}

// Cached transcripts of idle sessions go stale when history changes elsewhere (another tab,
// a delete); drop them so the next read reloads. Running sessions are the source of truth.
if (typeof window !== "undefined") {
  subscribeChats(() => {
    let changed = false;
    for (const [id, s] of sessions) {
      if (!s.running) {
        sessions.delete(id);
        changed = true;
      }
    }
    if (changed) emit();
  });
}

/** Current state of a session: in memory if loaded or running, otherwise from localStorage. */
function snapshot(sessionId: string): ChatSessionState {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { messages: loadTranscript(sessionId), running: false };
    sessions.set(sessionId, s);
  }
  return s;
}

/** Live view of one session, re-rendering as its reply streams in — even after navigating away and back. */
export function useChatSession(sessionId: string): ChatSessionState {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(sessionId),
    () => EMPTY, // server render: transcripts are client-only
  );
}

/** Ids of sessions with a reply streaming right now — for the sidebar's "generating" marker. */
export function useRunningSessions(): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => running,
    () => [],
  );
}

/** Mirrors the server's own event -> block reducer (agent-response.ts's toEvents). */
function applyEvent(messages: ChatMessage[], event: ChatEvent): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return messages;
  const withBlocks = (blocks: ContentBlock[]) => [...messages.slice(0, -1), { ...last, blocks }];

  if (event.type === "text") {
    // A text delta appends to the trailing markdown block, or starts one.
    const prev = last.blocks.at(-1);
    return withBlocks(
      prev?.type === "markdown"
        ? [...last.blocks.slice(0, -1), { ...prev, text: prev.text + event.delta }]
        : [...last.blocks, { type: "markdown", text: event.delta }],
    );
  }
  if (event.type === "block") return withBlocks([...last.blocks, event.block]);
  if (event.type === "error") return withBlocks([...last.blocks, { type: "markdown", text: `\n[error: ${event.error}]` }]);
  if (event.type === "done" && event.report) return [...messages.slice(0, -1), { ...last, report: event.report }];
  return messages;
}

function update(sessionId: string, fn: (m: ChatMessage[]) => ChatMessage[]): void {
  const s = snapshot(sessionId);
  set(sessionId, { ...s, messages: fn(s.messages) });
}

/**
 * Sends one message in a session and streams the reply into the store. Resolves when the
 * turn ends; nothing here is tied to a mounted component. No-op while that session is
 * already generating.
 */
export async function sendChatMessage(sessionId: string, raw: string): Promise<void> {
  const { display, prompt, reportName } = parseInput(raw);
  const current = snapshot(sessionId);
  if (!prompt || current.running) return;

  const started: ChatMessage[] = [
    ...current.messages,
    { role: "user", content: display },
    { role: "assistant", blocks: [], pending: true },
  ];
  set(sessionId, { messages: started, running: true });
  saveTranscript(sessionId, started); // the question is kept even if the page is closed now

  try {
    // Report commands (/morning-brief, /daily-report) run the real, window-aware report
    // instead of a client-built prompt. Both ask for the NDJSON encoding so charts, tables
    // and (for reports) the exported file all render instead of leaking as raw text.
    const res = reportName
      ? await fetch(`/api/reports/${reportName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: NDJSON },
          body: JSON.stringify({ sessionId }),
        })
      : await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: NDJSON },
          body: JSON.stringify({ message: prompt, sessionId }),
        });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.trim()) update(sessionId, (m) => applyEvent(m, JSON.parse(line) as ChatEvent));
      }
      if (done) {
        if (buf.trim()) update(sessionId, (m) => applyEvent(m, JSON.parse(buf) as ChatEvent));
        break;
      }
    }
  } catch (err) {
    if (unloading) return; // page is going away; pagehide already saved the partial answer
    update(sessionId, (m) => applyEvent(m, { type: "error", error: err instanceof Error ? err.message : String(err) }));
  } finally {
    if (!unloading) {
      const final = snapshot(sessionId).messages.map((m) =>
        m.role === "assistant" && m.pending ? { ...m, pending: undefined } : m,
      );
      set(sessionId, { messages: final, running: false });
      saveTranscript(sessionId, final);
      // Swap the sidebar title (first question) for a summary of the conversation.
      if (shouldRetitle(final)) void refreshChatTitle(sessionId, final);
    }
  }
}

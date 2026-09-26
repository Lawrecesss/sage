"use client";

import { ArrowUp, CalendarRange, FileText, Lock, type LucideIcon, Plus, Search, Sun, Sunrise, Sunset } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageBlocks } from "@/components/chat/MessageBlocks";
import { TopBar } from "@/components/shell/TopBar";
import { buttonClass } from "@/components/ui";
import { loadTranscript, refreshChatTitle, saveTranscript, shouldRetitle } from "@/lib/chat-history";
import { chatPath, newSessionId } from "@/lib/session-id";
import { parseInput, SLASH_COMMANDS, suggestCommands } from "@/lib/slash-commands";
import type { ChatEvent, ContentBlock } from "@/lib/types";
import styles from "./chat.module.css";

type Message = { role: "user"; content: string } | { role: "assistant"; blocks: ContentBlock[] };

const NDJSON = "application/x-ndjson";
const MAX_INPUT_HEIGHT = 220;
// How long a stream can go quiet (e.g. a tool call between blocks) before the thinking
// indicator reappears — long enough that normal token-by-token streaming never flickers it.
const THINKING_DELAY_MS = 500;

/** Presentation for the suggestion cards; the commands themselves live in slash-commands.ts. */
const COMMAND_UI: Record<string, { title: string; icon: LucideIcon }> = {
  "morning-brief": { title: "Morning brief", icon: Sunrise },
  "afternoon-report": { title: "Afternoon report", icon: Sun },
  "evening-report": { title: "Evening report", icon: Sunset },
  "daily-report": { title: "Daily report", icon: FileText },
  "weekly-report": { title: "Weekly report", icon: CalendarRange },
  explain: { title: "Explain a signal", icon: Search },
};

export function Chat({ sessionId, initialInput = "" }: { sessionId: string; initialInput?: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  // True once the mount effect has checked localStorage for this session, so a saved
  // transcript that just hasn't loaded yet is never mistaken for "genuinely a new chat" (see
  // `empty` below) — without this, a slow first paint briefly shows the "New chat" welcome
  // screen and command cards over an existing conversation instead of a neutral loading state.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  // Set by send(), cleared once the finished turn is saved — so only a completed turn
  // updates the history (merely opening an old chat must not bump it to "Today").
  const turnPending = useRef(false);
  const [input, setInput] = useState(initialInput);
  const [busy, setBusy] = useState(false);
  // Shown whenever the stream has gone quiet for a beat — the initial wait for the first
  // token, and any later pause between blocks (a tool call, a chart being computed, etc).
  const [showThinking, setShowThinking] = useState(false);
  const thinkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // `immediate` skips the delay for the turn's very first wait, so the indicator appears at
  // once instead of leaving a blank bubble for THINKING_DELAY_MS.
  function armThinking(immediate = false) {
    if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
    if (immediate) {
      setShowThinking(true);
      return;
    }
    setShowThinking(false);
    thinkingTimer.current = setTimeout(() => setShowThinking(true), THINKING_DELAY_MS);
  }
  function disarmThinking() {
    if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
    thinkingTimer.current = null;
    setShowThinking(false);
  }

  const suggestions = suggestCommands(input);
  // A fully typed argument-less command ("/morning-brief") is ready to send, not to complete.
  const complete = suggestions.length === 1 && input === `/${suggestions[0].name}`;
  const menuOpen = suggestions.length > 0 && !complete && !dismissed;
  const empty = historyLoaded && messages.length === 0;

  // Effects use block bodies: anything returned is treated as a cleanup function,
  // and newer Chrome returns a Promise from scrollIntoView().
  // Restore after mount (localStorage is client-only), then persist each completed turn —
  // which also updates the sidebar's chat history (lib/chat-history.ts).
  useEffect(() => {
    setMessages(loadTranscript(sessionId));
    setHistoryLoaded(true);
    inputRef.current?.focus();
  }, [sessionId]);
  useEffect(() => {
    if (busy || !turnPending.current) return;
    turnPending.current = false;
    saveTranscript(sessionId, messages);
    // Swap the sidebar title (first question) for a summary of the conversation.
    if (shouldRetitle(messages)) void refreshChatTitle(sessionId, messages);
  }, [busy, messages, sessionId]);
  useEffect(() => {
    if (messages.length) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);
  useEffect(() => {
    setActive(0);
    setDismissed(false);
  }, [input]);
  useEffect(() => {
    return () => {
      if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
    };
  }, []);

  // Auto-grow the composer with its content, up to a cap.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [input]);

  async function send(raw: string) {
    const { display, prompt, reportName } = parseInput(raw);
    if (!prompt || busy) return;

    setInput("");
    turnPending.current = true;
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: display }, { role: "assistant", blocks: [] }]);
    armThinking(true);

    // Mirrors the server's own event -> block reducer (agent-response.ts's toEvents): a text
    // delta appends to the trailing markdown block, a block event ends it and adds a complete
    // chart / table / file after it.
    const applyEvent = (event: ChatEvent) => {
      if (event.type === "done" || event.type === "error") disarmThinking();
      else armThinking();
      setMessages((m) => {
        const last = m[m.length - 1];
        if (last.role !== "assistant") return m;
        if (event.type === "text") {
          const prev = last.blocks.at(-1);
          const blocks: ContentBlock[] =
            prev?.type === "markdown"
              ? [...last.blocks.slice(0, -1), { ...prev, text: prev.text + event.delta }]
              : [...last.blocks, { type: "markdown", text: event.delta }];
          return [...m.slice(0, -1), { ...last, blocks }];
        }
        if (event.type === "block") {
          return [...m.slice(0, -1), { ...last, blocks: [...last.blocks, event.block] }];
        }
        if (event.type === "error") {
          return [...m.slice(0, -1), { ...last, blocks: [...last.blocks, { type: "markdown", text: `\n[error: ${event.error}]` }] }];
        }
        return m; // "done": nothing left to apply
      });
    };

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
          if (line.trim()) applyEvent(JSON.parse(line) as ChatEvent);
        }
        if (done) {
          if (buf.trim()) applyEvent(JSON.parse(buf) as ChatEvent);
          break;
        }
      }
    } catch (err) {
      applyEvent({ type: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      disarmThinking();
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function pickCommand(name: string, args?: string) {
    setInput(`/${name}${args ? " " : ""}`);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (menuOpen) {
      const n = suggestions.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % n);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + n) % n);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const c = suggestions[Math.min(active, n - 1)];
        pickCommand(c.name, c.args);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function newConversation() {
    router.push(chatPath(newSessionId()));
  }

  const canSend = !busy && input.trim().length > 0;
  const activeId = menuOpen ? `cmd-${suggestions[Math.min(active, suggestions.length - 1)].name}` : undefined;

  return (
    <>
      <TopBar
        title="Chat"
        actions={
          <button type="button" onClick={newConversation} disabled={busy} className={buttonClass("secondary", "sm")}>
            <Plus size={16} strokeWidth={2} aria-hidden />
            New chat
          </button>
        }
      />
      <div className={styles.chat} data-empty={empty || undefined}>
        <section className={styles.log} aria-live="polite" aria-label="Conversation">
          {empty && (
            <div className={styles.intro}>
              <span className={styles.introMark} aria-hidden>
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1.5c3.6 0 6.5 2.9 6.5 6.5S11.6 14.5 8 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M8 14.5C4.4 14.5 1.5 11.6 1.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
                  <circle cx="8" cy="8" r="2.25" fill="currentColor" />
                </svg>
              </span>
              <h2 className={styles.introTitle}>What would you like to know?</h2>
              <p className={styles.introText}>
                Ask about sales, stock or cash. Every answer is drawn from your own data and cites the metrics and signals
                behind it.
              </p>
              <div className={styles.commands}>
                {SLASH_COMMANDS.map((c) => {
                  const ui = COMMAND_UI[c.name] ?? { title: c.name, icon: FileText };
                  const Icon = ui.icon;
                  return (
                    <button key={c.name} type="button" className={styles.command} onClick={() => pickCommand(c.name, c.args)}>
                      <span className={styles.commandIcon} aria-hidden>
                        <Icon size={18} strokeWidth={1.75} />
                      </span>
                      <span className={styles.commandTitle}>{ui.title}</span>
                      <span className={styles.commandDesc}>{c.description}</span>
                      <span className={styles.commandHint}>
                        /{c.name}
                        {c.args ? ` ${c.args}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className={styles.rowUser}>
                <div className={styles.user}>{m.content}</div>
              </div>
            ) : (
              <div key={i} className={styles.row}>
                <span className={styles.mark} aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1.5c3.6 0 6.5 2.9 6.5 6.5S11.6 14.5 8 14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M8 14.5C4.4 14.5 1.5 11.6 1.5 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
                    <circle cx="8" cy="8" r="2.25" fill="currentColor" />
                  </svg>
                </span>
                <div className={styles.assistantText}>
                  <span className="visually-hidden">Sage:</span>
                  {m.blocks.length > 0 && <MessageBlocks blocks={m.blocks} />}
                  {busy && i === messages.length - 1 && showThinking && (
                    <span className={styles.thinking}>
                      <span className={styles.dots} aria-hidden>
                        <span />
                        <span />
                        <span />
                      </span>
                      Analysing your data…
                    </span>
                  )}
                </div>
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </section>

        <div className={styles.composer}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className={styles.form}
          >
            {menuOpen && (
              <ul className={styles.suggest} role="listbox" id="command-menu" aria-label="Commands">
                {suggestions.map((c, idx) => {
                  const ui = COMMAND_UI[c.name] ?? { title: c.name, icon: FileText };
                  const Icon = ui.icon;
                  const selected = idx === Math.min(active, suggestions.length - 1);
                  return (
                    <li
                      key={c.name}
                      id={`cmd-${c.name}`}
                      role="option"
                      aria-selected={selected}
                      className={selected ? styles.suggestActive : styles.suggestItem}
                      onMouseEnter={() => setActive(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault(); // keep focus in the textarea
                        pickCommand(c.name, c.args);
                      }}
                    >
                      <Icon size={16} strokeWidth={1.75} aria-hidden className={styles.suggestIcon} />
                      <span className={styles.suggestName}>
                        /{c.name}
                        {c.args ? ` ${c.args}` : ""}
                      </span>
                      <span className={styles.suggestDesc}>{c.description}</span>
                    </li>
                  );
                })}
                <li className={styles.suggestFoot} aria-hidden>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> to move · <kbd>Enter</kbd> to select · <kbd>Esc</kbd> to close
                </li>
              </ul>
            )}
            <div className={styles.inputShell}>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask Sage, or type / for commands"
                disabled={busy}
                className={styles.input}
                aria-label="Message Sage"
                aria-autocomplete="list"
                aria-controls={menuOpen ? "command-menu" : undefined}
                aria-expanded={menuOpen}
                aria-activedescendant={activeId}
              />
              <button type="submit" disabled={!canSend} className={styles.send} aria-label="Send message" title="Send (Enter)">
                {busy ? <span className={styles.spinner} aria-hidden /> : <ArrowUp size={18} strokeWidth={2.25} aria-hidden />}
              </button>
            </div>
          </form>
          <p className={styles.hint}>
            <Lock size={12} strokeWidth={2} aria-hidden />
            Sage is read-only and can&apos;t change your data.
            <span className={styles.hintKeys}>Enter to send · Shift + Enter for a new line</span>
          </p>
        </div>
      </div>
    </>
  );
}

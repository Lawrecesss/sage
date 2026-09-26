"use client";

import { ArrowUp, FileText, Lock, type LucideIcon, Plus, Search, Sunrise } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageBlocks } from "@/components/chat/MessageBlocks";
import { TopBar } from "@/components/shell/TopBar";
import { buttonClass } from "@/components/ui";
import { sendChatMessage, useChatSession } from "@/lib/chat-runs";
import { chatPath, newSessionId } from "@/lib/session-id";
import { SLASH_COMMANDS, suggestCommands } from "@/lib/slash-commands";
import styles from "./chat.module.css";

const MAX_INPUT_HEIGHT = 220;

/** Presentation for the suggestion cards; the commands themselves live in slash-commands.ts. */
const COMMAND_UI: Record<string, { title: string; icon: LucideIcon }> = {
  "morning-brief": { title: "Morning brief", icon: Sunrise },
  "daily-report": { title: "Daily report", icon: FileText },
  explain: { title: "Explain a signal", icon: Search },
};

export function Chat({ sessionId, initialInput = "" }: { sessionId: string; initialInput?: string }) {
  const router = useRouter();
  // The conversation and its in-flight reply live in lib/chat-runs.ts, not in this component,
  // so a reply keeps streaming while another session is open and is here when you come back.
  const { messages, running: busy } = useChatSession(sessionId);
  const [input, setInput] = useState(initialInput);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = suggestCommands(input);
  // A fully typed argument-less command ("/morning-brief") is ready to send, not to complete.
  const complete = suggestions.length === 1 && input === `/${suggestions[0].name}`;
  const menuOpen = suggestions.length > 0 && !complete && !dismissed;
  const empty = messages.length === 0;

  // Effects use block bodies: anything returned is treated as a cleanup function,
  // and newer Chrome returns a Promise from scrollIntoView().
  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);
  useEffect(() => {
    if (messages.length) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);
  useEffect(() => {
    setActive(0);
    setDismissed(false);
  }, [input]);

  // Auto-grow the composer with its content, up to a cap.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [input]);

  async function send(raw: string) {
    if (busy || !raw.trim()) return;
    setInput("");
    await sendChatMessage(sessionId, raw);
    inputRef.current?.focus();
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
          <button type="button" onClick={newConversation} className={buttonClass("secondary", "sm")}>
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
                  {m.pending && !busy && (
                    // Saved mid-answer, then the page was closed or reloaded before it finished.
                    <span className={styles.interrupted}>
                      This answer was interrupted before it finished. Ask again to get a complete answer.
                    </span>
                  )}
                  {!m.blocks.length && busy && i === messages.length - 1 ? (
                    <span className={styles.thinking}>
                      <span className={styles.dots} aria-hidden>
                        <span />
                        <span />
                        <span />
                      </span>
                      Analysing your data…
                    </span>
                  ) : null}
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

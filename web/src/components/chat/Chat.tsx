"use client";

import { useEffect, useRef, useState } from "react";
import { parseInput, SLASH_COMMANDS, suggestCommands } from "@/lib/slash-commands";
import styles from "./chat.module.css";

type Message = { role: "user" | "assistant"; content: string };

const SESSION_KEY = "sage.sessionId";

// crypto.randomUUID() only exists in secure contexts (https, or http://localhost).
// getRandomValues has no such restriction, so fall back to it when serving over plain http.
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function loadSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = newId();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return newId();
  }
}

export function Chat({ initialInput = "" }: { initialInput?: string }) {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialInput);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = suggestCommands(input);

  // Effects use block bodies: anything returned is treated as a cleanup function,
  // and newer Chrome returns a Promise from scrollIntoView().
  useEffect(() => {
    setSessionId(loadSessionId());
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(raw: string) {
    const { display, prompt, reportName } = parseInput(raw);
    if (!prompt || busy || !sessionId) return;

    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: display }, { role: "assistant", content: "" }]);
    const appendToReply = (chunk: string) =>
      setMessages((m) => {
        const last = m[m.length - 1];
        return [...m.slice(0, -1), { ...last, content: last.content + chunk }];
      });

    try {
      // Report commands (/morning-brief, /daily-report) run the real, window-aware report
      // instead of a client-built prompt — same plain-text stream contract as /api/chat.
      const res = reportName
        ? await fetch(`/api/reports/${reportName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          })
        : await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: prompt, sessionId }),
          });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        appendToReply(value);
      }
    } catch (err) {
      appendToReply(`\n[error: ${err instanceof Error ? err.message : String(err)}]`);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function pickCommand(name: string, args?: string) {
    setInput(`/${name}${args ? " " : ""}`);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Tab completes the first matching slash command.
    if (e.key === "Tab" && suggestions.length) {
      e.preventDefault();
      pickCommand(suggestions[0].name, suggestions[0].args);
    }
  }

  function newConversation() {
    const id = newId();
    try {
      localStorage.setItem(SESSION_KEY, id);
    } catch {}
    setSessionId(id);
    setMessages([]);
  }

  return (
    <div className={styles.chat}>
      <section className={styles.log} aria-live="polite">
        {messages.length === 0 && (
          <div className={styles.intro}>
            <h2 className={styles.introTitle}>Ask about your business</h2>
            <p className={styles.introText}>
              Every answer comes from your own data through Sage&apos;s read-only tools, for example “Which open signal
              costs us the most?”
            </p>
            <div className={styles.commands}>
              {SLASH_COMMANDS.map((c) => (
                <button key={c.name} type="button" className={styles.command} onClick={() => pickCommand(c.name, c.args)}>
                  <span className={styles.commandName}>
                    /{c.name}
                    {c.args ? ` ${c.args}` : ""}
                  </span>
                  <span className={styles.commandDesc}>{c.description}</span>
                </button>
              ))}
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
              <div className={styles.assistant}>
                <span className={styles.mark} aria-hidden>
                  SG
                </span>
                <div className={styles.assistantText}>
                  {m.content || (busy && i === messages.length - 1 ? <span className={styles.thinking}>Thinking…</span> : "")}
                </div>
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
          {suggestions.length > 0 && (
            <ul className={styles.suggest} role="listbox">
              {suggestions.map((c) => (
                <li key={c.name}>
                  <button type="button" onClick={() => pickCommand(c.name, c.args)}>
                    <span className={styles.suggestName}>
                      /{c.name}
                      {c.args ? ` ${c.args}` : ""}
                    </span>
                    <span className={styles.suggestDesc}>{c.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask Sage, or type / for commands"
            disabled={busy}
            className={styles.input}
          />
          <button type="button" onClick={newConversation} disabled={busy} className={styles.reset}>
            New
          </button>
          <button type="submit" disabled={busy || !input.trim()} className={styles.send}>
            Send
          </button>
        </form>
        <div className={styles.hint}>Tab completes a command · Sage is read-only and cannot change your data</div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBlocks } from "@/components/chat/MessageBlocks";
import { parseInput, SLASH_COMMANDS, suggestCommands } from "@/lib/slash-commands";
import type { ChatEvent, ContentBlock } from "@/lib/types";
import styles from "./chat.module.css";

type Message = { role: "user"; content: string } | { role: "assistant"; blocks: ContentBlock[] };

const SESSION_KEY = "sage.sessionId";
const NDJSON = "application/x-ndjson";

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
    setMessages((m) => [...m, { role: "user", content: display }, { role: "assistant", blocks: [] }]);

    // Mirrors the server's own event -> block reducer (agent-response.ts's toEvents): a text
    // delta appends to the trailing markdown block, a block event ends it and adds a complete
    // chart / table / file after it.
    const applyEvent = (event: ChatEvent) =>
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
                  {m.blocks.length ? (
                    <MessageBlocks blocks={m.blocks} />
                  ) : busy && i === messages.length - 1 ? (
                    <span className={styles.thinking}>Thinking…</span>
                  ) : null}
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

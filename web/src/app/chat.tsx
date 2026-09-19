"use client";

import { useEffect, useRef, useState } from "react";

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

export function Chat() {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Effects use block bodies: anything returned is treated as a cleanup function,
  // and newer Chrome returns a Promise from scrollIntoView().
  useEffect(() => {
    setSessionId(loadSessionId());
  }, []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !sessionId) return;

    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    const appendToReply = (chunk: string) =>
      setMessages((m) => {
        const last = m[m.length - 1];
        return [...m.slice(0, -1), { ...last, content: last.content + chunk }];
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
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
    <main style={styles.main}>
      <header style={styles.header}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Sage</h1>
        <button onClick={newConversation} disabled={busy} style={styles.secondary}>
          New conversation
        </button>
      </header>

      <section style={styles.log}>
        {messages.length === 0 && (
          <p style={{ color: "#666" }}>Ask about your business, e.g. “Which open signal costs us the most?”</p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={m.role === "user" ? styles.user : styles.assistant}>
            {m.content || (busy && i === messages.length - 1 ? "Thinking…" : "")}
          </div>
        ))}
        <div ref={bottomRef} />
      </section>

      <form onSubmit={send} style={styles.form}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Sage…"
          disabled={busy}
          style={styles.input}
        />
        <button type="submit" disabled={busy || !input.trim()} style={styles.primary}>
          Send
        </button>
      </form>
    </main>
  );
}

const bubble: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  maxWidth: "85%",
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 760,
    margin: "0 auto",
    padding: "24px 16px",
    height: "100dvh",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontFamily: "system-ui, sans-serif",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  log: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 },
  user: { ...bubble, alignSelf: "flex-end", background: "#2f6f4f", color: "#fff" },
  assistant: { ...bubble, alignSelf: "flex-start", background: "#f1f1ee", color: "#1a1a1a" },
  form: { display: "flex", gap: 8 },
  input: { flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 15 },
  primary: { padding: "10px 16px", borderRadius: 8, border: 0, background: "#2f6f4f", color: "#fff" },
  secondary: { padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc", background: "transparent" },
};

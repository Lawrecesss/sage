import { useState, useRef, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const SHORTCUTS = [
  {
    key: '/morning',
    emoji: '☀️',
    label: 'Morning Brief',
    desc: 'Stockout risks, PO delays, reorder breaches',
    color: '#f59e0b',
  },
  {
    key: '/afternoon',
    emoji: '🌤️',
    label: 'Mid-Day Sales',
    desc: 'Revenue, AOV, channel mix vs target',
    color: '#22d3ee',
  },
  {
    key: '/evening',
    emoji: '🌆',
    label: 'Evening Margin',
    desc: 'Attach rates, returns, COGS, gross margin',
    color: '#a78bfa',
  },
  {
    key: '/night',
    emoji: '🌙',
    label: 'Nightly Recon',
    desc: 'AR/AP ageing, daily net cash flow',
    color: '#34d399',
  },
];

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content:
      "Good morning, Keanu. Today's operational snapshot is ready. You have **3 stockout alerts** across SG-North and MY-KL outlets, and 2 supplier POs are delayed beyond threshold. Use a shortcut above or ask me anything.",
    ts: '08:04',
  },
];

const SAMPLE_RESPONSES: Record<string, Message> = {
  '/morning': {
    id: 'morning',
    role: 'assistant',
    content: `**Morning Operational Brief — 19 Sep 2026**\n\n**Stockout Risks (3 breaches)**\n— KALLAX 4×4 White: SG-North 0 units (DoS: 0d)\n— BILLY Oak: MY-KL 4 units (DoS: 0.8d)\n— HEMNES Dresser: SG-East 6 units (DoS: 1.2d)\n\n**Supplier PO Delays (2 active)**\n— PO-8821 (Supplier: PT Agung) — 4 days overdue, 120 units BEKANT Desk\n— PO-8834 (Supplier: Artek SG) — 2 days overdue, 80 units POÄNG Chair\n\n**Reorder Point Breaches (5 SKUs)**\n→ Recommend initiating emergency inter-outlet transfer from MY-JB for KALLAX. See transfer plan?`,
    ts: '08:05',
    chart: true,
  },
  '/afternoon': {
    id: 'afternoon',
    role: 'assistant',
    content: `**Mid-Day Sales Velocity — 19 Sep 2026, 12:00 cutoff**\n\nGross Revenue: **SGD 284,120** (↑ 6.4% vs yesterday)\nNet Revenue: **SGD 261,390** after returns & discounts\nAOV: **SGD 412** vs SGD 387 target ✅\n\n**Channel Mix**\n— In-Store: 54% (↓ 3pp vs Mon avg)\n— Web/App: 38% (↑ 5pp, driven by BILLY promo)\n— Marketplace: 8%\n\nCategory leader: **Shelving & Storage** at 29% of GMV. Furniture Assembly attach rate: 61% (target 55%) ✅`,
    ts: '12:14',
    chart: true,
  },
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: string;
  chart?: boolean;
}

const CHART_DATA = [
  { time: '06:00', revenue: 12400, target: 14000 },
  { time: '08:00', revenue: 38900, target: 35000 },
  { time: '10:00', revenue: 87200, target: 80000 },
  { time: '12:00', revenue: 148500, target: 140000 },
  { time: '14:00', revenue: 202100, target: 195000 },
  { time: '16:00', revenue: 241800, target: 240000 },
  { time: '18:00', revenue: 284120, target: 280000 },
];

function renderContent(text: string) {
  return text.split('\n').map((line, i) => {
    const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return (
      <span key={i} style={{ display: 'block' }} dangerouslySetInnerHTML={{ __html: bold }} />
    );
  });
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      ts: new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setLoading(true);
    setTimeout(() => {
      const response =
        SAMPLE_RESPONSES[trimmed] ||
        SAMPLE_RESPONSES[trimmed.split(' ')[0]] || {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: `Querying metrics layer for: "${trimmed}"\n\nI found relevant data across 3 outlets. The top result: **SG-North** has 14 units of the matching SKU with 4.2 days of supply remaining. Would you like a full outlet breakdown or a transfer recommendation?`,
          ts: new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }),
        };
      setMessages(m => [...m, { ...response, id: Date.now().toString() }]);
      setLoading(false);
    }, 900);
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 flex-shrink-0"
        style={{ height: 56, borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              fontSize: 15,
              color: 'var(--foreground)',
            }}
          >
            AI Command Center
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--muted-foreground)',
              marginLeft: 12,
            }}
          >
            MCP · metrics.yaml
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot active label="Warehouse API" />
          <StatusDot active label="AI Model" />
        </div>
      </div>

      {/* Shortcut cards */}
      <div
        className="grid gap-3 px-6 py-4 flex-shrink-0"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}
      >
        {SHORTCUTS.map(s => (
          <button
            key={s.key}
            onClick={() => send(s.key)}
            className="flex flex-col gap-1.5 p-3 text-left transition-all duration-150"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
            }}
            onMouseEnter={e =>
              ((e.currentTarget as HTMLElement).style.borderColor = s.color + '60')
            }
            onMouseLeave={e =>
              ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border)')
            }
          >
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 14 }}>{s.emoji}</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: s.color,
                  letterSpacing: '0.05em',
                }}
              >
                {s.key}
              </span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 600,
                fontSize: 12,
                color: 'var(--foreground)',
              }}
            >
              {s.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
              {s.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className="flex gap-3"
            style={{ justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
          >
            {msg.role === 'assistant' && (
              <div
                style={{
                  width: 28,
                  height: 28,
                  background: 'rgba(34,211,238,0.12)',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 1l1.2 3.6L10.6 6 7.2 7.2 6 10.6 4.8 7.2 1.4 6l3.4-1.4L6 1z"
                    fill="#22d3ee"
                  />
                </svg>
              </div>
            )}
            <div style={{ maxWidth: '72%' }}>
              <div
                className="px-4 py-3"
                style={{
                  background: msg.role === 'user' ? 'rgba(34,211,238,0.1)' : 'var(--card)',
                  border: `1px solid ${msg.role === 'user' ? 'rgba(34,211,238,0.25)' : 'var(--border)'}`,
                  borderRadius: 3,
                  fontSize: 13,
                  color: 'var(--foreground)',
                  lineHeight: 1.65,
                  fontFamily: msg.role === 'assistant' ? 'var(--font-body)' : 'var(--font-body)',
                }}
              >
                {renderContent(msg.content)}
                {msg.chart && (
                  <div style={{ marginTop: 16, height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={CHART_DATA}>
                        <defs>
                          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                        <XAxis
                          dataKey="time"
                          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{
                            background: '#0d1424',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: 2,
                            fontSize: 11,
                            fontFamily: 'JetBrains Mono',
                            color: '#e8edf5',
                          }}
                          formatter={(v: unknown) => [`SGD ${Number(v).toLocaleString()}`, 'Revenue']}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#22d3ee"
                          strokeWidth={1.5}
                          fill="url(#rev)"
                        />
                        <Area
                          type="monotone"
                          dataKey="target"
                          stroke="#64748b"
                          strokeWidth={1}
                          strokeDasharray="3 3"
                          fill="none"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--muted-foreground)',
                  marginTop: 4,
                  fontFamily: 'var(--font-mono)',
                  textAlign: msg.role === 'user' ? 'right' : 'left',
                }}
              >
                {msg.ts}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div
              style={{
                width: 28,
                height: 28,
                background: 'rgba(34,211,238,0.12)',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M6 1l1.2 3.6L10.6 6 7.2 7.2 6 10.6 4.8 7.2 1.4 6l3.4-1.4L6 1z"
                  fill="#22d3ee"
                />
              </svg>
            </div>
            <div
              className="px-4 py-3 flex items-center gap-1.5"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 3,
              }}
            >
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="px-6 py-4 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div
          className="flex items-end gap-3"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
          }}
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder='Ask anything — "Which outlet has KALLAX in stock?" or use a shortcut above'
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'var(--foreground)',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
              lineHeight: 1.6,
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            style={{
              padding: '6px 14px',
              background: input.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
              color: input.trim() ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              border: 'none',
              borderRadius: 2,
              fontSize: 12,
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              cursor: input.trim() ? 'pointer' : 'default',
              transition: 'all 0.15s',
              letterSpacing: '0.02em',
              flexShrink: 0,
            }}
          >
            Send ↵
          </button>
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--muted-foreground)',
            marginTop: 6,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Connected to metrics.yaml MCP · Outlet scope: ALL · Period: Today
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: active ? '#22d3ee' : '#64748b',
          boxShadow: active ? '0 0 6px rgba(34,211,238,0.6)' : 'none',
        }}
      />
      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
    </div>
  );
}

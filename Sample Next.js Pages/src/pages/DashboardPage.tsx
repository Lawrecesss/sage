import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

type Domain = 'Sales' | 'Inventory' | 'Accounting';

const TABS: Domain[] = ['Sales', 'Inventory', 'Accounting'];

const TAB_COLORS: Record<Domain, string> = {
  Sales: '#22d3ee',
  Inventory: '#f59e0b',
  Accounting: '#a78bfa',
};

/* ── Sales Data ─────────────────────────────── */
const SALES_METRICS = [
  { label: 'Gross Revenue', value: 'SGD 2.84M', change: '+6.4%', up: true, sub: 'MTD' },
  { label: 'Net Revenue', value: 'SGD 2.61M', change: '+5.1%', up: true, sub: 'After returns' },
  { label: 'AOV', value: 'SGD 412', change: '+6.5%', up: true, sub: 'vs SGD 387 target' },
  { label: 'Units Sold', value: '6,904', change: '+3.8%', up: true, sub: 'MTD' },
  { label: 'Return Rate', value: '4.2%', change: '+0.3pp', up: false, sub: 'vs 3.8% target' },
  { label: 'Attach Rate', value: '61%', change: '+6pp', up: true, sub: 'Assembly upsell' },
];

const REVENUE_WEEKLY = [
  { day: 'Mon', gross: 380000, net: 348000 },
  { day: 'Tue', gross: 412000, net: 379000 },
  { day: 'Wed', gross: 395000, net: 363000 },
  { day: 'Thu', gross: 441000, net: 406000 },
  { day: 'Fri', gross: 528000, net: 484000 },
  { day: 'Sat', gross: 612000, net: 562000 },
  { day: 'Sun', gross: 284000, net: 261000 },
];

const CHANNEL_MIX = [
  { name: 'In-Store', value: 54, color: '#22d3ee' },
  { name: 'Web/App', value: 38, color: '#06b6d4' },
  { name: 'Marketplace', value: 8, color: '#0e7490' },
];

const CATEGORY_REV = [
  { cat: 'Shelving', rev: 820000 },
  { cat: 'Bedroom', rev: 640000 },
  { cat: 'Living', rev: 480000 },
  { cat: 'Office', rev: 320000 },
  { cat: 'Kitchen', rev: 220000 },
  { cat: 'Outdoor', rev: 180000 },
];

/* ── Inventory Data ─────────────────────────── */
const INV_METRICS = [
  { label: 'Stock on Hand', value: '84,240 units', change: '−2.1%', up: false, sub: 'Across 6 outlets' },
  { label: 'Stockout Rate', value: '3.2%', change: '+0.8pp', up: false, sub: '↑ Alert threshold 3%' },
  { label: 'Avg Days of Supply', value: '14.2d', change: '−1.4d', up: false, sub: 'vs 16d target' },
  { label: 'Dead Stock Value', value: 'SGD 1.24M', change: '+8.4%', up: false, sub: '90+ day DoS' },
  { label: 'Avg Lead Time', value: '6.8d', change: '+0.6d', up: false, sub: 'Supplier average' },
  { label: 'Reorder Breaches', value: '5 SKUs', change: 'New', up: false, sub: 'As of today' },
];

const OUTLET_HEALTH = [
  { outlet: 'SG-North', stockout: 4.8, dos: 10.2, health: 58 },
  { outlet: 'SG-East', stockout: 2.1, dos: 16.4, health: 82 },
  { outlet: 'SG-Central', stockout: 1.4, dos: 18.8, health: 91 },
  { outlet: 'MY-KL', stockout: 5.2, dos: 9.6, health: 54 },
  { outlet: 'MY-JB', stockout: 1.8, dos: 21.0, health: 88 },
  { outlet: 'MY-PG', stockout: 2.6, dos: 15.2, health: 78 },
];

/* ── Accounting Data ────────────────────────── */
const ACC_METRICS = [
  { label: 'Gross Margin %', value: '38.4%', change: '−1.8pp', up: false, sub: 'vs 40.2% Q2' },
  { label: 'COGS (MTD)', value: 'SGD 1.74M', change: '+9.2%', up: false, sub: 'Month-to-date' },
  { label: 'Discount Impact', value: 'SGD 228K', change: '+12%', up: false, sub: 'Revenue reduction' },
  { label: 'Net Cash Flow', value: '+SGD 48.3K', change: 'Daily', up: true, sub: 'Yesterday' },
  { label: 'AR Ageing (60d+)', value: 'SGD 212K', change: '3 invoices', up: false, sub: 'Overdue' },
  { label: 'AP Due This Week', value: 'SGD 89.1K', change: '4 vendors', up: false, sub: 'Upcoming' },
];

const MARGIN_TREND = [
  { month: 'Apr', margin: 41.2 },
  { month: 'May', margin: 40.8 },
  { month: 'Jun', margin: 40.2 },
  { month: 'Jul', margin: 39.6 },
  { month: 'Aug', margin: 39.1 },
  { month: 'Sep', margin: 38.4 },
];

/* ── Domain widget configs ──────────────────── */
const DOMAIN_DATA: Record<Domain, { metrics: typeof SALES_METRICS; chart: React.ReactNode }> = {
  Sales: {
    metrics: SALES_METRICS,
    chart: null,
  },
  Inventory: {
    metrics: INV_METRICS,
    chart: null,
  },
  Accounting: {
    metrics: ACC_METRICS,
    chart: null,
  },
};

/* ── AI Slide-over ──────────────────────────── */
function AISlideOver({
  metric,
  domain,
  onClose,
}: {
  metric: (typeof SALES_METRICS)[0];
  domain: Domain;
  onClose: () => void;
}) {
  const color = TAB_COLORS[domain];
  const ANALYSIS = [
    `**Root cause analysis for ${metric.label}**\n\nThe ${metric.change} movement in ${metric.label} this period is attributable to a combination of supplier-side pressure and demand mix shift.`,
    `**Primary driver:** Bedroom category discount over-indexing (−2.3pp margin drag) contributed most to this variance. The promo period for HEMNES range ended last week but cart-level blended margins haven't fully recovered.`,
    `**Secondary driver:** COGS for upholstered items rose 4.1% following raw material cost escalation from PT Agung. This was partially offset by improved attach rates on assembly services (+6pp).`,
    `**Recommended action:** Trigger markdown reset on 12 high-DoS SKUs to recapture working capital. Review supplier contract with PT Agung before next PO cycle.`,
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: 'var(--card)',
        borderLeft: `1px solid ${color}40`,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-24px 0 80px rgba(0,0,0,0.5)',
      }}
    >
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1l1.4 4.2L12.4 7 8.4 8.4 7 12.4 5.6 8.4 1.6 7l4-1.4L7 1z"
              fill={color}
            />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 14,
              color: 'var(--foreground)',
            }}
          >
            Ask AI — {metric.label}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        <div
          style={{
            background: `${color}10`,
            border: `1px solid ${color}30`,
            borderRadius: 3,
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 24,
              color,
              marginBottom: 4,
            }}
          >
            {metric.value}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            {metric.label} · {metric.sub}
          </div>
        </div>

        {ANALYSIS.map((para, i) => {
          const bold = para.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          return (
            <div
              key={i}
              style={{
                fontSize: 13,
                color: i === 0 ? 'var(--foreground)' : 'var(--card-foreground)',
                lineHeight: 1.75,
                fontFamily: 'var(--font-body)',
              }}
              dangerouslySetInnerHTML={{ __html: bold }}
            />
          );
        })}
      </div>

      <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          style={{
            width: '100%',
            padding: '9px',
            background: color,
            color: '#000c12',
            border: 'none',
            borderRadius: 2,
            fontSize: 13,
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Open Full Analysis in Chat →
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [domain, setDomain] = useState<Domain>('Sales');
  const [aiMetric, setAiMetric] = useState<(typeof SALES_METRICS)[0] | null>(null);
  const color = TAB_COLORS[domain];
  const metrics = DOMAIN_DATA[domain].metrics;

  return (
    <div style={{ background: 'var(--background)', minHeight: '100%' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-8"
        style={{ height: 56, borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-6">
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 16,
              color: 'var(--foreground)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Executive Dashboard
          </h1>
          {/* Domain tabs */}
          <div className="flex items-center gap-1">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setDomain(t)}
                style={{
                  padding: '5px 14px',
                  background: domain === t ? `${TAB_COLORS[t]}14` : 'transparent',
                  border: `1px solid ${domain === t ? TAB_COLORS[t] + '50' : 'transparent'}`,
                  borderRadius: 2,
                  color: domain === t ? TAB_COLORS[t] : 'var(--muted-foreground)',
                  fontSize: 13,
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <FilterChip label="All Outlets" />
          <FilterChip label="Sep 2026" />
        </div>
      </div>

      <div className="p-8">
        {/* KPI Grid */}
        <div
          className="grid gap-px mb-8"
          style={{
            gridTemplateColumns: 'repeat(3, 1fr)',
            background: 'var(--border)',
            borderRadius: 3,
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}
        >
          {metrics.map(m => (
            <div
              key={m.label}
              className="flex flex-col justify-between"
              style={{ background: 'var(--card)', padding: '20px 24px' }}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--muted-foreground)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {m.label}
                </div>
                <button
                  onClick={() => setAiMetric(m)}
                  className="flex items-center gap-1 transition-opacity"
                  style={{
                    padding: '3px 8px',
                    background: `${color}14`,
                    border: `1px solid ${color}30`,
                    borderRadius: 2,
                    color,
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.7')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                >
                  ✨ Ask AI
                </button>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    fontSize: 26,
                    color: 'var(--foreground)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                    marginBottom: 8,
                  }}
                >
                  {m.value}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      color: m.up ? '#34d399' : '#f87171',
                    }}
                  >
                    {m.change}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {m.sub}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        {domain === 'Sales' && (
          <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <ChartCard title="Weekly Revenue (Gross vs Net)">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={REVENUE_WEEKLY} barGap={2}>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0d1424',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 2,
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono',
                      color: '#e8edf5',
                    }}
                    formatter={(v: unknown, name: unknown) => [
                      `SGD ${Number(v).toLocaleString()}`,
                      name === 'gross' ? 'Gross' : 'Net',
                    ]}
                  />
                  <Bar dataKey="gross" fill="#22d3ee" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="net" fill="#0e7490" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Channel Mix & Category Revenue">
              <div className="flex gap-6 h-full" style={{ height: 200 }}>
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={CHANNEL_MIX}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {CHANNEL_MIX.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: '#0d1424',
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: 2,
                          fontSize: 11,
                          fontFamily: 'JetBrains Mono',
                          color: '#e8edf5',
                        }}
                        formatter={(v: unknown) => [`${v}%`]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 justify-center" style={{ minWidth: 120 }}>
                  {CHANNEL_MIX.map(c => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          background: c.color,
                          borderRadius: 1,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--muted-foreground)',
                        }}
                      >
                        {c.name}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--foreground)',
                          marginLeft: 'auto',
                        }}
                      >
                        {c.value}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>
        )}

        {domain === 'Inventory' && (
          <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <ChartCard title="Outlet Health Score">
              <div className="flex flex-col gap-3 mt-2">
                {OUTLET_HEALTH.map(o => (
                  <div key={o.outlet} className="flex items-center gap-3">
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--muted-foreground)',
                        width: 80,
                        flexShrink: 0,
                      }}
                    >
                      {o.outlet}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${o.health}%`,
                          height: '100%',
                          background:
                            o.health >= 80 ? '#34d399' : o.health >= 65 ? '#f59e0b' : '#f87171',
                          borderRadius: 2,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        color: o.health >= 80 ? '#34d399' : o.health >= 65 ? '#f59e0b' : '#f87171',
                        width: 32,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {o.health}
                    </span>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Stockout Rate by Outlet">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={OUTLET_HEALTH} layout="vertical">
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}%`}
                  />
                  <YAxis
                    dataKey="outlet"
                    type="category"
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0d1424',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 2,
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono',
                      color: '#e8edf5',
                    }}
                    formatter={(v: unknown) => [`${v}%`, 'Stockout Rate']}
                  />
                  <Bar dataKey="stockout" radius={[0, 2, 2, 0]}>
                    {OUTLET_HEALTH.map((o, i) => (
                      <Cell
                        key={i}
                        fill={o.stockout > 4 ? '#f87171' : o.stockout > 2.5 ? '#f59e0b' : '#34d399'}
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}

        {domain === 'Accounting' && (
          <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <ChartCard title="Gross Margin % Trend">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={MARGIN_TREND}>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                    domain={[36, 43]}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0d1424',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 2,
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono',
                      color: '#e8edf5',
                    }}
                    formatter={(v: unknown) => [`${v}%`, 'Gross Margin']}
                  />
                  <Line
                    type="monotone"
                    dataKey="margin"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={{ fill: '#a78bfa', r: 3, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="AR / AP Ageing Summary">
              <div className="flex flex-col gap-4 pt-2">
                <AgeingRow label="AR — Current (<30d)" amount="SGD 184K" color="#34d399" pct={46} />
                <AgeingRow label="AR — 30–60d" amount="SGD 128K" color="#f59e0b" pct={32} />
                <AgeingRow label="AR — 60d+" amount="SGD 212K" color="#f87171" pct={22} />
                <div style={{ height: 1, background: 'var(--border)' }} />
                <AgeingRow label="AP — Due this week" amount="SGD 89K" color="#a78bfa" pct={35} />
                <AgeingRow label="AP — Due this month" amount="SGD 241K" color="#6d28d9" pct={65} />
              </div>
            </ChartCard>
          </div>
        )}
      </div>

      {/* AI slide-over */}
      {aiMetric && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 99,
            }}
            onClick={() => setAiMetric(null)}
          />
          <AISlideOver metric={aiMetric} domain={domain} onClose={() => setAiMetric(null)} />
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 3,
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--muted-foreground)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 16,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <button
      style={{
        padding: '5px 12px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 2,
        color: 'var(--foreground)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {label}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 3.5l3 3 3-3" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function AgeingRow({
  label,
  amount,
  color,
  pct,
}: {
  label: string;
  amount: string;
  color: string;
  pct: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)' }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>
          {amount}
        </span>
      </div>
      <div
        style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}
      >
        <div
          style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }}
        />
      </div>
    </div>
  );
}

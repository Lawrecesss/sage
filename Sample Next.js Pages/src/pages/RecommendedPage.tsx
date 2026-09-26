import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const AFFINITY_METRICS = [
  {
    id: 'm1',
    label: 'Stockout Rate',
    domain: 'inventory',
    color: '#f59e0b',
    queryCount: 48,
    value: '3.2%',
    change: '+0.8pp',
    up: false,
    tags: ['stockout', 'outlet-health', 'reorder'],
    pinned: true,
    sparkData: [2.1, 2.4, 2.2, 2.8, 3.0, 2.9, 3.2],
  },
  {
    id: 'm2',
    label: 'Gross Revenue',
    domain: 'sales',
    color: '#22d3ee',
    queryCount: 41,
    value: 'SGD 2.84M',
    change: '+6.4%',
    up: true,
    tags: ['revenue', 'channel-mix', 'daily'],
    pinned: true,
    sparkData: [2.1, 2.4, 2.3, 2.6, 2.5, 2.7, 2.84],
  },
  {
    id: 'm3',
    label: 'Gross Margin %',
    domain: 'accounting',
    color: '#a78bfa',
    queryCount: 36,
    value: '38.4%',
    change: '−1.8pp',
    up: false,
    tags: ['margin', 'cogs', 'discount'],
    pinned: false,
    sparkData: [41.2, 40.8, 40.2, 39.6, 39.1, 38.7, 38.4],
  },
  {
    id: 'm4',
    label: 'Days of Supply',
    domain: 'inventory',
    color: '#f59e0b',
    queryCount: 29,
    value: '14.2d',
    change: '−1.4d',
    up: false,
    tags: ['dos', 'dead-stock', 'outlet'],
    pinned: false,
    sparkData: [16.4, 16.1, 15.8, 15.4, 15.1, 14.6, 14.2],
  },
  {
    id: 'm5',
    label: 'Net Cash Flow',
    domain: 'accounting',
    color: '#a78bfa',
    queryCount: 22,
    value: '+SGD 48.3K',
    change: 'Daily',
    up: true,
    tags: ['cashflow', 'ar-ap', 'reconciliation'],
    pinned: false,
    sparkData: [31.2, 44.8, 38.4, 52.1, 41.6, 55.3, 48.3],
  },
  {
    id: 'm6',
    label: 'AOV',
    domain: 'sales',
    color: '#22d3ee',
    queryCount: 19,
    value: 'SGD 412',
    change: '+6.5%',
    up: true,
    tags: ['aov', 'basket', 'attach-rate'],
    pinned: false,
    sparkData: [374, 381, 388, 393, 400, 407, 412],
  },
];

const DOMAIN_COLORS: Record<string, string> = {
  sales: '#22d3ee',
  inventory: '#f59e0b',
  accounting: '#a78bfa',
};

const QUERY_FREQ = [
  { week: 'W33', stockout: 6, revenue: 5, margin: 4, dos: 3, cashflow: 2 },
  { week: 'W34', stockout: 8, revenue: 6, margin: 5, dos: 4, cashflow: 3 },
  { week: 'W35', stockout: 7, revenue: 7, margin: 5, dos: 4, cashflow: 3 },
  { week: 'W36', stockout: 9, revenue: 8, margin: 6, dos: 5, cashflow: 3 },
  { week: 'W37', stockout: 12, revenue: 10, margin: 9, dos: 7, cashflow: 5 },
  { week: 'W38', stockout: 10, revenue: 9, margin: 8, dos: 6, cashflow: 4 },
];

type MetricCard = (typeof AFFINITY_METRICS)[0];

export default function RecommendedPage() {
  const [tiles, setTiles] = useState(AFFINITY_METRICS);
  const [alertsOpen, setAlertsOpen] = useState(false);

  function togglePin(id: string) {
    setTiles(prev => prev.map(t => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
  }

  const pinned = tiles.filter(t => t.pinned);
  const suggested = tiles.filter(t => !t.pinned);

  return (
    <div style={{ background: 'var(--background)', minHeight: '100%' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-8"
        style={{ height: 56, borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 16,
              color: 'var(--foreground)',
              margin: 0,
              letterSpacing: '-0.02em',
              display: 'inline',
            }}
          >
            Recommended View
          </h1>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--muted-foreground)',
              marginLeft: 12,
            }}
          >
            Personalised for Keanu L.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--muted-foreground)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#22d3ee',
                boxShadow: '0 0 6px rgba(34,211,238,0.6)',
              }}
            />
            AI affinity model updated 2h ago
          </div>
          <button
            onClick={() => setAlertsOpen(!alertsOpen)}
            style={{
              padding: '5px 12px',
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: 2,
              color: '#f87171',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
          >
            ⚡ 3 Deviation Alerts
          </button>
        </div>
      </div>

      <div className="p-8">
        {/* Alerts */}
        {alertsOpen && (
          <div
            className="mb-6"
            style={{
              background: 'rgba(248,113,113,0.05)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 3,
              padding: '16px 20px',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: '#f87171',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Deviation Alerts — Active
            </div>
            <div className="flex flex-col gap-3">
              {[
                {
                  metric: 'Stockout Rate',
                  msg: 'SG-North breached 4.5% threshold — 3 SKUs at zero stock',
                  sev: 'critical',
                },
                {
                  metric: 'Gross Margin %',
                  msg: 'Fell below 39% floor — bedroom category discount over-indexing',
                  sev: 'warning',
                },
                {
                  metric: 'Supplier Lead Time',
                  msg: 'PT Agung PO-8821 now 4 days overdue (threshold: 2d)',
                  sev: 'warning',
                },
              ].map(a => (
                <div key={a.metric} className="flex items-start gap-3">
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: a.sev === 'critical' ? '#f87171' : '#f59e0b',
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        fontSize: 12,
                        color: 'var(--foreground)',
                      }}
                    >
                      {a.metric}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground)', marginLeft: 8 }}>
                      {a.msg}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Affinity heatmap */}
        <div
          className="mb-8"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: '20px 24px',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--muted-foreground)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Query Affinity — 6-Week Trend
            </div>
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--muted-foreground)',
              }}
            >
              Queries / week
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={QUERY_FREQ}>
              <defs>
                {[
                  ['stockout', '#f59e0b'],
                  ['revenue', '#22d3ee'],
                  ['margin', '#a78bfa'],
                ].map(([key, color]) => (
                  <linearGradient key={key} id={`g-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
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
              />
              <Area type="monotone" dataKey="stockout" stroke="#f59e0b" strokeWidth={1.5} fill="url(#g-stockout)" name="Stockout Rate" />
              <Area type="monotone" dataKey="revenue" stroke="#22d3ee" strokeWidth={1.5} fill="url(#g-revenue)" name="Gross Revenue" />
              <Area type="monotone" dataKey="margin" stroke="#a78bfa" strokeWidth={1.5} fill="url(#g-margin)" name="Gross Margin" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pinned tiles */}
        {pinned.length > 0 && (
          <div className="mb-8">
            <div
              className="flex items-center gap-2 mb-4"
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1l.8 2.4L8.5 5 6.3 6.6 5 9l-1.3-2.4L1.5 5l2.7-1.6L5 1z" fill="#22d3ee" />
              </svg>
              Pinned Metrics ({pinned.length})
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {pinned.map(m => (
                <MetricTile key={m.id} metric={m} onTogglePin={togglePin} />
              ))}
            </div>
          </div>
        )}

        {/* AI suggested */}
        <div>
          <div
            className="flex items-center gap-2 mb-4"
            style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1l1.2 3.6L10.6 6 7.2 7.2 6 10.6 4.8 7.2 1.4 6l3.4-1.4L6 1z" fill="#64748b" />
            </svg>
            AI Suggested Layout — Based on your query history
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {suggested.map(m => (
              <MetricTile key={m.id} metric={m} onTogglePin={togglePin} suggested />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  metric,
  onTogglePin,
  suggested,
}: {
  metric: MetricCard;
  onTogglePin: (id: string) => void;
  suggested?: boolean;
}) {
  const spark = metric.sparkData;
  const min = Math.min(...spark);
  const max = Math.max(...spark);
  const pts = spark
    .map(
      (v, i) =>
        `${(i / (spark.length - 1)) * 100},${100 - ((v - min) / (max - min || 1)) * 80 + 10}`,
    )
    .join(' ');

  return (
    <div
      style={{
        background: 'var(--card)',
        border: suggested
          ? '1px dashed rgba(255,255,255,0.12)'
          : `1px solid ${metric.color}30`,
        borderRadius: 3,
        padding: '20px 24px',
        position: 'relative',
      }}
    >
      {/* Domain + query badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: DOMAIN_COLORS[metric.domain],
              background: `${DOMAIN_COLORS[metric.domain]}14`,
              padding: '2px 8px',
              borderRadius: 2,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {metric.domain}
          </span>
          <div className="flex items-center gap-1">
            {metric.tags.slice(0, 2).map(tag => (
              <span
                key={tag}
                style={{
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--muted-foreground)',
                  background: 'rgba(255,255,255,0.05)',
                  padding: '2px 5px',
                  borderRadius: 2,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--muted-foreground)',
            }}
          >
            {metric.queryCount} queries
          </span>
          <button
            onClick={() => onTogglePin(metric.id)}
            style={{
              width: 24,
              height: 24,
              background: metric.pinned ? `${metric.color}20` : 'rgba(255,255,255,0.05)',
              border: `1px solid ${metric.pinned ? metric.color + '40' : 'var(--border)'}`,
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: metric.pinned ? metric.color : 'var(--muted-foreground)',
              fontSize: 11,
            }}
            title={metric.pinned ? 'Unpin' : 'Pin to top'}
          >
            {metric.pinned ? '📌' : '+'}
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--muted-foreground)',
              marginBottom: 6,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {metric.label}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 28,
              color: 'var(--foreground)',
              letterSpacing: '-0.02em',
              lineHeight: 1,
              marginBottom: 8,
            }}
          >
            {metric.value}
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: metric.up ? '#34d399' : '#f87171',
            }}
          >
            {metric.change}
          </div>
        </div>

        {/* Sparkline */}
        <svg
          width="100"
          height="48"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ flexShrink: 0 }}
        >
          <defs>
            <linearGradient id={`spark-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metric.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={metric.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <polygon
            points={`0,100 ${pts} 100,100`}
            fill={`url(#spark-${metric.id})`}
          />
          <polyline
            points={pts}
            fill="none"
            stroke={metric.color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  );
}

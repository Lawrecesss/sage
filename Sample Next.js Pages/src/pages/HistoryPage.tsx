import { useState } from 'react';

const DOMAIN_COLORS: Record<string, string> = {
  sales: '#22d3ee',
  inventory: '#f59e0b',
  accounting: '#a78bfa',
  mixed: '#34d399',
};

interface Report {
  id: string;
  title: string;
  domain: 'sales' | 'inventory' | 'accounting' | 'mixed';
  created: string;
  creator: string;
  metrics: string[];
  preview: string;
}

const REPORTS: Report[] = [
  {
    id: 'r001',
    title: 'Morning Operational Brief — Stockout & PO Delay Analysis',
    domain: 'inventory',
    created: '19 Sep 2026, 08:05',
    creator: 'Keanu L.',
    metrics: ['Stockout Rate', 'Days of Supply', 'Reorder Breaches', 'Supplier Lead Time'],
    preview:
      '3 stockout alerts in SG-North, MY-KL, SG-East. KALLAX 4×4 at zero stock. 2 supplier POs overdue beyond threshold.',
  },
  {
    id: 'r002',
    title: 'Mid-Day Sales Velocity Report — Channel Mix Deep Dive',
    domain: 'sales',
    created: '18 Sep 2026, 12:14',
    creator: 'Keanu L.',
    metrics: ['Gross Revenue', 'Net Revenue', 'AOV', 'Channel Mix', 'Return Rate'],
    preview:
      'SGD 284,120 gross revenue by 12:00 cutoff. Web/App channel surged +5pp driven by BILLY promo. AOV exceeded target at SGD 412.',
  },
  {
    id: 'r003',
    title: 'Q3 Gross Margin vs COGS Variance — Category Breakdown',
    domain: 'accounting',
    created: '17 Sep 2026, 17:30',
    creator: 'Aisha M.',
    metrics: ['Gross Margin %', 'COGS', 'Discount Impact', 'Category Revenue'],
    preview:
      'Gross margin declined 1.8pp QoQ primarily from bedroom category over-discounting and supplier cost escalation on upholstered furniture.',
  },
  {
    id: 'r004',
    title: 'Nightly Reconciliation — AR/AP Ageing & Cash Flow',
    domain: 'accounting',
    created: '16 Sep 2026, 23:58',
    creator: 'System',
    metrics: ['Net Cash Flow', 'AR Ageing', 'AP Ageing'],
    preview:
      'Net daily cash flow: SGD +48,320. 3 invoices in 60+ day AR bucket totalling SGD 212,400. AP due this week: SGD 89,100.',
  },
  {
    id: 'r005',
    title: 'Dead Stock & Slow-Mover Clearance Opportunity Report',
    domain: 'inventory',
    created: '15 Sep 2026, 09:22',
    creator: 'Keanu L.',
    metrics: ['Dead Stock Value', 'Days of Supply', 'Units Sold'],
    preview:
      '47 SKUs flagged with 90+ day DoS. Dead stock value: SGD 1.24M across 3 outlets. AI recommends markdown trigger on 12 high-volume SKUs.',
  },
  {
    id: 'r006',
    title: 'Weekly Executive Summary — All Domains',
    domain: 'mixed',
    created: '14 Sep 2026, 18:00',
    creator: 'System',
    metrics: ['Gross Revenue', 'Stock on Hand', 'Gross Margin %', 'Net Cash Flow'],
    preview:
      'Week-on-week revenue up 4.2%. Inventory health score 74/100 (−3 from prior week). Gross margin 38.4%. Cash position healthy.',
  },
  {
    id: 'r007',
    title: 'Outlet Transfer Recommendation — SG-North → SG-East',
    domain: 'inventory',
    created: '13 Sep 2026, 11:44',
    creator: 'Keanu L.',
    metrics: ['Stock on Hand', 'Days of Supply', 'Stockout Rate'],
    preview:
      'AI-suggested inter-outlet transfer of 240 units across 8 SKUs to balance overstock at SG-North against critical shortages at SG-East.',
  },
  {
    id: 'r008',
    title: 'BILLY Shelf Promotion ROI — Post-Campaign Analysis',
    domain: 'sales',
    created: '12 Sep 2026, 16:00',
    creator: 'Aisha M.',
    metrics: ['Gross Revenue', 'Units Sold', 'Discount Impact', 'AOV'],
    preview:
      'BILLY 4-day promotion drove 3,840 units sold (+182% vs baseline). Net revenue impact positive after discount cost of SGD 48,200.',
  },
];

const DOMAINS = ['all', 'sales', 'inventory', 'accounting', 'mixed'];

export default function HistoryPage() {
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('all');
  const [selected, setSelected] = useState<Report | null>(null);

  const filtered = REPORTS.filter(r => {
    const matchDomain = domain === 'all' || r.domain === domain;
    const matchSearch =
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.metrics.some(m => m.toLowerCase().includes(search.toLowerCase()));
    return matchDomain && matchSearch;
  });

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>
      {/* Left panel */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{ width: 420, borderRight: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="px-5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)', paddingTop: 16, paddingBottom: 16 }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: 18,
              color: 'var(--foreground)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Report History
          </h1>
          <p
            style={{
              fontSize: 12,
              color: 'var(--muted-foreground)',
              marginTop: 4,
              marginBottom: 16,
            }}
          >
            {REPORTS.length} analytical sessions archived
          </p>

          {/* Search */}
          <div
            className="flex items-center gap-2 px-3"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              height: 36,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="5.5" cy="5.5" r="4" stroke="#64748b" strokeWidth="1.3" />
              <path d="M9 9l2.5 2.5" stroke="#64748b" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reports or metrics..."
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 12,
                color: 'var(--foreground)',
                fontFamily: 'var(--font-body)',
                flex: 1,
              }}
            />
          </div>

          {/* Domain filter */}
          <div className="flex items-center gap-1.5 mt-3" style={{ flexWrap: 'wrap' }}>
            {DOMAINS.map(d => (
              <button
                key={d}
                onClick={() => setDomain(d)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 2,
                  border: `1px solid ${domain === d ? DOMAIN_COLORS[d] || 'var(--primary)' : 'var(--border)'}`,
                  background:
                    domain === d
                      ? `${DOMAIN_COLORS[d] || 'var(--primary)'}18`
                      : 'transparent',
                  color:
                    domain === d
                      ? DOMAIN_COLORS[d] || 'var(--primary)'
                      : 'var(--muted-foreground)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="w-full text-left px-5 py-4 transition-colors duration-100"
              style={{
                background: selected?.id === r.id ? 'var(--card)' : 'transparent',
                borderBottom: '1px solid var(--border)',
                borderLeft: `3px solid ${selected?.id === r.id ? DOMAIN_COLORS[r.domain] : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: DOMAIN_COLORS[r.domain],
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    background: `${DOMAIN_COLORS[r.domain]}18`,
                    padding: '2px 6px',
                    borderRadius: 2,
                  }}
                >
                  {r.domain}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--muted-foreground)',
                    fontFamily: 'var(--font-mono)',
                    flexShrink: 0,
                  }}
                >
                  {r.created.split(',')[0]}
                </span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  fontSize: 13,
                  color: 'var(--foreground)',
                  lineHeight: 1.4,
                  marginBottom: 6,
                }}
              >
                {r.title}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--muted-foreground)',
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {r.preview}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <div className="p-8">
            {/* Top bar */}
            <div className="flex items-start justify-between gap-6 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: DOMAIN_COLORS[selected.domain],
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      background: `${DOMAIN_COLORS[selected.domain]}18`,
                      padding: '3px 8px',
                      borderRadius: 2,
                    }}
                  >
                    {selected.domain}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    {selected.id}
                  </span>
                </div>
                <h2
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    fontSize: 22,
                    color: 'var(--foreground)',
                    letterSpacing: '-0.025em',
                    lineHeight: 1.25,
                    margin: 0,
                    maxWidth: 560,
                  }}
                >
                  {selected.title}
                </h2>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: 'var(--muted-foreground)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Generated {selected.created} · by {selected.creator}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <ActionBtn label="Update with Latest Data" primary />
                <ActionBtn label="Export PDF" />
                <ActionBtn label="Export CSV" />
              </div>
            </div>

            {/* Metrics cited */}
            <div
              className="p-5 mb-6"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--muted-foreground)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Metrics Referenced
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.metrics.map(m => (
                  <span
                    key={m}
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--foreground)',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border)',
                      padding: '4px 10px',
                      borderRadius: 2,
                    }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>

            {/* Report snapshot */}
            <div
              className="p-6"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--muted-foreground)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 16,
                }}
              >
                Report Snapshot
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--foreground)',
                  lineHeight: 1.75,
                  margin: 0,
                  fontFamily: 'var(--font-body)',
                }}
              >
                {selected.preview}
              </p>

              {/* Fake data rows */}
              <div
                style={{
                  marginTop: 24,
                  borderTop: '1px solid var(--border)',
                  paddingTop: 20,
                }}
              >
                <div
                  className="grid gap-px"
                  style={{
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    background: 'var(--border)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  {selected.metrics.slice(0, 3).map((m, i) => (
                    <div key={m} style={{ background: 'var(--card)', padding: '16px 20px' }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--muted-foreground)',
                          marginBottom: 6,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {m}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          fontSize: 22,
                          color: ['#22d3ee', '#f59e0b', '#a78bfa'][i % 3],
                        }}
                      >
                        {['SGD 284K', '38.4%', '4.2d'][i % 3]}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#34d399',
                          marginTop: 4,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {['↑ 6.4%', '↓ 1.8pp', '→ stable'][i % 3]} vs prior period
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 11,
                color: 'var(--muted-foreground)',
                fontFamily: 'var(--font-mono)',
                padding: '0 2px',
              }}
            >
              Snapshot data is frozen as of generation time. Use "Update with Latest Data" to
              recompute metrics against current warehouse state.
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full flex-col gap-4">
            <div
              style={{
                width: 56,
                height: 56,
                background: 'rgba(34,211,238,0.06)',
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="9" stroke="#64748b" strokeWidth="1.5" />
                <path d="M11 7v4l3 3" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
              Select a report to view details
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <button
      style={{
        padding: '7px 14px',
        background: primary ? 'var(--primary)' : 'var(--card)',
        color: primary ? 'var(--primary-foreground)' : 'var(--foreground)',
        border: primary ? 'none' : '1px solid var(--border)',
        borderRadius: 2,
        fontSize: 12,
        fontFamily: 'var(--font-heading)',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
    >
      {label}
    </button>
  );
}

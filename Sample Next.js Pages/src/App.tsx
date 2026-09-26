import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import ChatPage from './pages/ChatPage';
import HistoryPage from './pages/HistoryPage';
import DashboardPage from './pages/DashboardPage';
import RecommendedPage from './pages/RecommendedPage';

const NAV = [
  { to: '/', label: 'Chat', icon: ChatIcon, exact: true },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { to: '/dashboard/recommended', label: 'Recommended', icon: SparkleIcon },
];

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 transition-all duration-200"
        style={{
          width: collapsed ? 56 : 220,
          background: 'var(--card)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-4 flex-shrink-0"
          style={{ height: 56, borderBottom: '1px solid var(--border)' }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              background: 'var(--primary)',
              borderRadius: 2,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" fill="#000c12" />
              <rect x="8" y="1" width="5" height="5" fill="#000c12" opacity="0.6" />
              <rect x="1" y="8" width="5" height="5" fill="#000c12" opacity="0.6" />
              <rect x="8" y="8" width="5" height="5" fill="#000c12" />
            </svg>
          </div>
          {!collapsed && (
            <span
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: '-0.02em',
                color: 'var(--foreground)',
              }}
            >
              NEXUS
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 p-2 flex-1 mt-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className="flex items-center gap-3 px-3 py-2 transition-colors duration-100"
              style={({ isActive }) => ({
                borderRadius: 'var(--radius)',
                background: isActive ? 'rgba(34,211,238,0.1)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--secondary-foreground)',
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
                fontSize: 13,
                letterSpacing: '0.01em',
                textDecoration: 'none',
              })}
            >
              <Icon size={16} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center justify-center m-2 py-2 transition-colors duration-100"
          style={{
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
          >
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* User */}
        <div
          className="flex items-center gap-3 p-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-center text-xs font-bold"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'rgba(34,211,238,0.15)',
              color: 'var(--primary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            KL
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.2 }}>
                Keanu L.
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>VP Operations</div>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto min-w-0">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/recommended" element={<RecommendedPage />} />
        </Routes>
      </main>
    </div>
  );
}

/* Icon components */
function ChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M2 2h12v9H9l-3 3v-3H2V2z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M5 6h6M5 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function DashboardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function SparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

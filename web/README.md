# web — Sage frontend

Next.js 15 (App Router) with React 19. No UI or chart libraries: styling is CSS Modules plus design tokens, charts are inline SVG. Desktop-first.

## Screens

Three pages in the sidebar, matching the agreed structure:

| Route | What it shows | Data |
|---|---|---|
| `/` | **Chat** — streaming conversation with the agent, slash commands, `?q=` prefills the input | `POST /api/chat` → OpenClaw |
| `/history` | **History** — the brief archive: list with search and domain filter on the left, the full brief on the right | `listBriefs()` |
| `/dashboard` | **Dashboard** — KPI grid, charts and open signals per domain (`?domain=sales\|inventory\|accounting`), with **Recommended** inside it | `getDomainDashboard()`, `getRecommended()`, `listSignals()` |

Drill-downs, reachable from those pages but not in the nav: `/signals`, `/signals/[id]`, `/metrics`, `/metrics/[id]`.

JSON endpoints: `GET /api/brief`, `/api/signals`, `/api/signals/[id]`, `/api/metrics`.

### Recommended

Recommended lives **inside the dashboard**, not as its own page. Collapsed, it is a single row: the metric names and current values only. Expanding it reveals the pinned and suggested tiles, why each is suggested, and the six-week question-frequency chart. It is a `<details>` element, so it works without client JavaScript; `/dashboard?rec=open` deep-links to the expanded state.

## Layout

```
src/
  app/                 routes (server components by default)
    page.tsx           Chat · history/ · dashboard/ · signals/ · metrics/
    api/               chat (OpenClaw proxy) + dashboard JSON routes
  components/
    shell/             Sidebar (collapsible), TopBar, ThemeToggle
    ui/                Card, badges, chips, Delta, EmptyState, ButtonLink
    charts/            Sparkline, LineChart, BarChart, BarList (all SVG)
    dashboard/         KpiGrid, RecommendedPanel
    brief/ history/ signals/ metrics/ chat/   feature components + CSS modules
  lib/
    types.ts           frontend contracts (Signal, Metric, Brief, Kpi, ...)
    data.ts            the only place pages get data from (mock/live switch)
    format.ts          SGD, percent, deltas, dates (Asia/Singapore)
    slash-commands.ts  /morning-brief, /daily-report, /explain <signal-id>
    openclaw.ts        server-only OpenClaw client (holds the token)
  mocks/
    fixtures.ts        signals + brief history for the Lian & Co. persona
    dashboard.ts       per-domain KPIs, charts, recommended metrics
    metrics.json       generated from metrics.yaml (`sql` field dropped)
```

## Conventions

- **Pages never fetch directly.** They call `lib/data.ts`. To switch to real data, implement the `live` branch there and leave the pages alone.
- **Types mirror other lanes' contracts.** The header of `lib/types.ts` says where each type comes from. Field names stay snake_case to match the wire format.
- **The interface is black and white; only charts carry colour.** Severity, status and domain are encoded with fill, weight and mark shape (filled / half / hollow square), never hue. Chart series use `--series-1..3` — validated categorical slots (blue, orange, aqua) with their own dark-mode steps, assigned in fixed order, plus a legend on any chart with two or more series.
- **Two themes, light and dark.** All colour lives in `app/globals.css`; components reference variables only. The toggle sits in the sidebar, is stored in `localStorage`, and is applied before first paint by a small inline script in `layout.tsx`.
- Components are server components unless they need state — only `Chat`, `Sidebar` and `ThemeToggle` are client components. Tabs, filters and the Recommended expander are plain links and `<details>`, so they work server-side.

## Develop

```
cp .env.local.example .env.local
pnpm install
pnpm dev            # http://localhost:3000
```

With `SAGE_DATA_SOURCE=mock` (the default), Dashboard, History, Signals and Metrics all work without any backend.

Chat needs more: `POST /api/chat` resolves the tenant before calling OpenClaw (`x-tenant-id` header, else `DEFAULT_TENANT_ID`) by reading `shared.tenants` — so it needs OpenClaw **and** Postgres with the control-plane tables seeded. Run `make up` and `make seed` from the repo root; without a database the route answers `502 tenant lookup unavailable`, and for a tenant that isn't active, `404`.

## Multi-tenancy

This app is the frontend *and* the backend (ARCHITECTURE.md §2) — the API routes here are the backend. Tenant identity is dev-mode only for now: `lib/tenant.ts` resolves it per request and `lib/openclaw.ts` threads it to the agent. Business data is per-tenant Postgres schemas (§3.2), so when `lib/data.ts` grows its `live` branch, its functions take the resolved tenant as their first argument. Mock mode deliberately ignores tenancy.

# web — Sage frontend

Next.js 15 (App Router) with React 19. No UI or chart libraries: styling is CSS Modules plus design tokens, charts are inline SVG. Desktop-first.

## Screens

Three pages in the sidebar, matching the agreed structure:

| Route | What it shows | Data |
|---|---|---|
| `/chat/[sessionId]` | **Chat** — one conversation per URL: streaming replies, slash commands, `?q=` prefills the input. `/` redirects to a fresh session | `POST /api/chat` → OpenClaw |
| `/reports` | **Reports** — the brief archive: list with search and domain filter on the left, the full brief on the right (`/history` redirects here) | `listBriefs()` |
| `/dashboard` | **Dashboard** — KPI grid, charts and open signals per domain (`?domain=sales\|inventory\|accounting`), with **Recommended** inside it | `getDomainDashboard()`, `getRecommended()`, `listSignals()` |

Drill-downs, reachable from those pages but not in the nav: `/signals`, `/signals/[id]`, `/metrics`, `/metrics/[id]`.

JSON endpoints: `GET /api/brief`, `/api/signals`, `/api/signals/[id]`, `/api/metrics`. Like
`/api/chat`, each resolves the tenant first (`x-tenant-id` header, else `DEFAULT_TENANT_ID`) and
404s an unknown/inactive one — so, unlike the pages above, these need Postgres with the
control-plane tables seeded even though they still serve mock data (`lib/data.ts`).

### Chat sessions

Each conversation has its own URL, `/chat/<sessionId>`. The session id is the key OpenClaw
keeps the conversation's history under, and it must pass the same check the API applies
(8–64 chars of `[A-Za-z0-9-]`) or the page 404s. `/` (redirected in `middleware.ts`) and the
**New** buttons start a new session.

The **Chat** item in the sidebar has an arrow that expands the chat history, like Claude or
ChatGPT: a **New chat** entry, then every past session grouped Today / Yesterday / Previous 7
days / Previous 30 days / Older, titled by its first message. Clicking one reopens it with the
full conversation; hovering shows a delete button. The expanded/collapsed state is remembered.

OpenClaw has no API to read a conversation back, so transcripts and the history index live in
the browser's `localStorage` (`lib/chat-history.ts`: `sage.chat.<sessionId>` and `sage.chats`).
History is per browser: another browser starts empty, though reopening a session URL there still
continues the same server-side conversation. A chat enters the history — and moves to the top —
only when a turn completes, not when an old one is merely opened.

### Recommended

Recommended lives **inside the dashboard**, not as its own page. Collapsed, it is a single row: the metric names and current values only. Expanding it reveals the pinned and suggested tiles, why each is suggested, and the six-week question-frequency chart. It is a `<details>` element, so it works without client JavaScript; `/dashboard?rec=open` deep-links to the expanded state.

## Layout

```
src/
  app/                 routes (server components by default)
    page.tsx           redirects to chat/[sessionId] · reports/ · dashboard/ · signals/ · metrics/
    api/               chat (OpenClaw proxy) + dashboard JSON routes
  components/
    shell/             Sidebar (collapsible), TopBar, ThemeToggle
    ui/                Card, badges, chips, Delta, EmptyState, ButtonLink
    charts/            Sparkline, LineChart, BarChart, BarList (all SVG)
    dashboard/         KpiGrid, RecommendedPanel
    brief/ reports/ signals/ metrics/ chat/   feature components + CSS modules
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

With `SAGE_DATA_SOURCE=mock` (the default), Dashboard, Reports, Signals and Metrics all work without any backend.

Chat needs more: `POST /api/chat` resolves the tenant before calling OpenClaw (`x-tenant-id` header, else `DEFAULT_TENANT_ID`) by reading `shared.tenants` — so it needs OpenClaw **and** Postgres with the control-plane tables seeded. Run `make up` and `make seed` from the repo root; without a database the route answers `502 tenant lookup unavailable`, and for a tenant that isn't active, `404`.

## Reports

Reports are saved per tenant (`lib/report-store.ts`) and listed on `/reports`, where each one can be discussed in chat, **exported as PDF** (`GET /api/reports/saved/[id]/pdf`, rendered server-side by `lib/report-pdf.ts`) or **deleted** (`DELETE /api/reports/saved/[id]`).

- **On demand:** `POST /api/reports/[name]` for the slash-command reports (`lib/commands.ts`).
- **Every 6 hours:** `lib/auto-reports.ts`, started from `src/instrumentation.ts`, runs a `six-hour-report` for each tenant with the retail module once each 00/06/12/18 (business time, `SAGE_TIMEZONE`) slot has closed. It checks every 15 minutes, so a restart catches up on the missed slot instead of skipping it; an advisory lock plus a "already saved?" check make it safe on several replicas. `SAGE_AUTO_REPORTS=off` turns it off.
- **Anomaly scan:** before every report, `lib/anomalies.ts` compares SKU gross revenue with the previous period (at least 7 days each, since sales are by date only) and flags hard movers — above all, *divergences*: one SKU grossing up while another in the same category grosses down. The findings go into the prompt for the agent to confirm and explain, and are saved with the report (shown above the prose and in the PDF).


## Multi-tenancy

This app is the frontend *and* the backend (ARCHITECTURE.md §2) — the API routes here are the backend. Tenant identity is dev-mode only for now: `lib/tenant.ts` resolves it per request and `lib/openclaw.ts` threads it to the agent. Business data is per-tenant Postgres schemas (§3.2), so when `lib/data.ts` grows its `live` branch, its functions take the resolved tenant as their first argument. Mock mode deliberately ignores tenancy.

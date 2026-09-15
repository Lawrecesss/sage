# apps/web — Sage web app

Next.js 15 (App Router) · TypeScript · Tailwind · shadcn/ui · Recharts · SSE.

Owned by **M3**. STUB — structure only.

## Routes

| Route | Screen | Notes |
| --- | --- | --- |
| `/` | Morning Brief | severity-ranked cards, sparklines, "why" expansion. The screenshot must communicate the product without narration. |
| `/signals` | Signals list | raw detector output, filterable by domain |
| `/ask` | Ask | conversational drill-down, streaming (SSE), inline charts, metric citations |
| `/connections` | Connections | static "3 systems, one brain" visual |

## API

The backend is Next.js Route Handlers under `src/app/api/` — no separate
Python service. Server-only logic (the OpenClaw HTTP client, settings, DB
access) lives in `src/server/`; never import it from a client component.

| Route | Method | Notes |
| --- | --- | --- |
| `/api/health` | GET | |
| `/api/brief/latest` | GET | last row in `briefings` — a failed run never removes the previous good brief |
| `/api/brief/[id]` | GET | |
| `/api/brief/run` | POST | 202 + `run_id`; poll via `/api/runs/[id]` |
| `/api/runs/[id]` | GET | poll a triggered `agent_runs` row |
| `/api/signals` | GET | |
| `/api/signals/[id]` | GET | |
| `/api/ask` | POST (SSE) | proxies the sage-ask OpenClaw agent |

STUB — structure only, no implementation yet.

## Contracts

`src/lib/types.ts` mirrors [`docs/contracts/brief-json.md`](../../docs/contracts/brief-json.md).
It is the frontend's source of truth — build the static Brief mock against it in
Sprint 1, no backend needed.

## Dev

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev
```

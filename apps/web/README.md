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

## Contracts

`src/lib/types.ts` mirrors [`docs/contracts/brief-json.md`](../../docs/contracts/brief-json.md)
and the API schemas in `packages/api/src/sage_api/schemas/`. It is the frontend's
source of truth — build the static Brief mock against it in Sprint 1, no backend
needed.

## Dev

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev
```

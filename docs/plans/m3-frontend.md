# M3 — Frontend & Experience Engineer

## Lane summary

- **Owns:** the entire Next.js app, visual design, interaction, the demo's look.
- **Backs up:** M2 on tool/API contracts.
- **Success test:** the Morning Brief **screenshot alone** communicates the product
  without narration.
- **You are the least blocked lane** — Sprint 1 needs no backend. But the Brief is
  what carries the pitch, so the bar is "beautiful", not "renders".

## Skills this lane wants

React / TypeScript / Next.js 15 App Router, Tailwind + shadcn/ui, Recharts, and
visual taste. SSE for the streaming Ask chat.

## Where your code goes

| Area | Path |
| --- | --- |
| Routes | `apps/web/src/app/{page,layout}.tsx`, `app/{signals,ask,connections}/page.tsx` |
| Components | `apps/web/src/components/{brief,signals,ask,ui}/` |
| Contract types | `apps/web/src/lib/types.ts` |
| API client | `apps/web/src/lib/api-client.ts` |
| Design tokens | `apps/web/src/app/globals.css`, `apps/web/tailwind.config.ts` |

Dev: `pnpm --filter web dev`. Build check: `pnpm --filter web build`. Lint: `pnpm --filter web lint`.

---

## Sprint 1 · Sep 8–14 — the static Brief, no backend

- [ ] **🔒 Freeze brief-JSON types with M2** — `apps/web/src/lib/types.ts` mirroring
      [`../contracts/brief-json.md`](../contracts/brief-json.md) and
      `packages/shared/src/sage_shared/types.py`
      *Done when:* `MorningBrief`, `BriefItem`, `CausalChain`, `Severity` TS types
      match the Pydantic models exactly. **Deadline Sep 14.** This is your source of
      truth for the rest of the build.

- [ ] **Design system** — `apps/web/src/app/globals.css`, `apps/web/tailwind.config.ts`
      *Done when:* colour tokens (incl. severity high/medium/low), type scale and
      spacing are defined; shadcn is initialised (`components.json` is already
      there) and a couple of base components (`card`, `badge`) are pulled into
      `components/ui/`.

- [ ] **App shell + nav** — `apps/web/src/app/layout.tsx`
      *Done when:* real layout with a header and nav to `/` · `/signals` · `/ask` ·
      `/connections`; fonts loaded; light/dark handled.

- [ ] **Brief fixture** — `apps/web/src/lib/fixtures/brief.json` (new)
      *Done when:* a realistic `MorningBrief` matching the frozen contract, built
      around the hero scenario (supplier delay → stockout → revenue + margin →
      recoverable cash). Coordinate the shape with M2, invent the values.

- [ ] **Static Morning Brief** — `apps/web/src/app/page.tsx`,
      `apps/web/src/components/brief/*` (`BriefCard.tsx`, `SeverityBadge.tsx`,
      `Sparkline.tsx`, `CausalChain.tsx`)
      *Done when:* `/` renders the fixture: headline, ≤5 severity-ranked cards, each
      with summary, dollar impact, recommended action, an expandable "why" (the
      causal chain), and a Recharts sparkline from `evidence[].series`.

**S1 gate:** `/` looks like a product on a phone-width screen, from the fixture.
`pnpm --filter web build` passes.

---

## Sprint 2 · Sep 15–21 — wire it to the real API

- [ ] **API client** — `apps/web/src/lib/api-client.ts`
      *Done when:* typed `getLatestBrief()`, `getSignals()`, `ask()` against
      `NEXT_PUBLIC_API_BASE_URL`, returning the `types.ts` types. Handles non-200.

- [ ] **Live Morning Brief** — `apps/web/src/app/page.tsx`
      *Done when:* `/` fetches `/brief/latest` (server component), falls back to the
      fixture if the API is down, and renders identically to the static version.

- [ ] **Signals list** — `apps/web/src/app/signals/page.tsx`,
      `apps/web/src/components/signals/*`
      *Done when:* a filterable-by-domain table of raw detector output from
      `/signals` — this is the "establish credibility with raw data" screen.

- [ ] **States** — across all screens
      *Done when:* loading skeletons, an error state, and an empty state ("nothing
      needs your attention today") all exist and look intentional.

**S2 gate (shared, Sep 21):** the live Brief renders a **real** `MorningBrief` from
the deployed API, in a browser pointed at AWS.

---

## Sprint 3 · Sep 22–28 — Ask, Connections, polish

- [ ] **Ask chat** — `apps/web/src/app/ask/page.tsx`, `apps/web/src/components/ask/*`
      *Done when:* a chat UI that streams the Ask agent's answer over SSE (from
      `POST /ask`), renders inline charts, and shows metric-id citations as chips
      that link back to the metric.

- [ ] **Connections visual** — `apps/web/src/app/connections/page.tsx`
      *Done when:* a static "3 systems, one brain" diagram — sales + inventory +
      accounting flowing into Sage. Sells the cross-source thesis in one image.

- [ ] **Polish pass** — all screens
      *Done when:* mobile layout is clean, transitions/motion are tasteful, the
      Brief screenshot needs no explanation. Take the screenshot M4 will use in the
      deck.

**S3 gate (hard, Sep 28):** the full demo run of screen looks demo-ready at
phone width and on a projector.

---

## What you hand off, and when

| To | Artifact | By |
| --- | --- | --- |
| M2 | `types.ts` mirrors `sage_shared.types` (jointly frozen) | Sep 14 |
| M2 | Confirmation the brief-JSON renders well — flag any awkward field early | Sep 16 |
| M4 | The Brief screenshot + any UI copy for the deck | Sep 27 |

## What you depend on

| From | Artifact | Expected |
| --- | --- | --- |
| M2 | Frozen brief-JSON | Sep 14 |
| M4 | API base URL + `/health` + `/brief/latest` reachable | Sep 15 |
| M2 (via API) | A real `MorningBrief` payload | Sep 20 |

## Your items on the cut list (if a sprint slips — order matters)

1. Ask chat richness → single-turn Q&A, no inline charts.
2. UI polish → function over finish; the eval number still carries the pitch.

**Never cut:** the Morning Brief UI.

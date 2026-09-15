# M2 — Agent Engineer

## Lane summary

- **Owns:** the MCP tool server (`agent/mcp`), the OpenClaw agent config
  (`agent/openclaw/` — agent definitions, prompts, the daily automation), and the eval
  harness.
- **Backs up:** M1 on detectors.
- **Success test:** the eval harness runs and prints a number, and the hero
  scenario's causal chain matches the ground truth.
- **`sage-briefing`'s cross-domain correlation is the product.** Everything else
  in this lane exists to feed it and to prove it works.

See [`../decisions/0003-openclaw-agent-runtime.md`](../decisions/0003-openclaw-agent-runtime.md)
for why this lane looks like config + an MCP server rather than an in-process
agent framework.

## Skills this lane wants

Python, prompt design, and an instinct for measurement (the eval harness is what
defends the pitch on stage) — plus comfort configuring a gateway (OpenClaw) rather
than hand-rolling an agent loop.

## Where your code goes

| Area | Path |
| --- | --- |
| MCP server | `agent/mcp/src/sage_mcp/server.py` |
| Tools (MCP, read) | `agent/mcp/src/sage_mcp/tools/{list_metrics,query_metric,compare_period,get_signals,trace_lineage}.py` |
| Tool (MCP, write) | `agent/mcp/src/sage_mcp/tools/save_brief.py` — the brief-JSON schema boundary |
| MCP server settings | `agent/mcp/src/sage_mcp/settings.py` |
| OpenClaw config template | `agent/openclaw/openclaw.json5` — agent definitions, model provider, MCP registration |
| Agent prompts | `agent/openclaw/prompts/{briefing,ask}.md` |
| Daily automation | `agent/openclaw/automations/daily-brief.md` |
| Shared OpenClaw client | `agent/shared/src/sage_shared/openclaw.py` (the future Next.js backend will likely call OpenClaw directly instead — see docs/team-plan.md) |
| Eval harness | `agent/evals/src/sage_evals/{harness,metrics,report}.py` |

Run your tests with `uv run pytest agent/mcp agent/evals`.

## LLM setup — one model, via the organisers' proxy

The LLM is the organisers' **Ollama-compatible, Bedrock-backed** endpoint,
configured as OpenClaw's model provider (`models.providers.sageOrganisers` in
`openclaw.json5`) — not called from Python directly. **One model for every
agent: Claude Sonnet 4.5** — no Opus, no Haiku, no per-tier scheme.

| Agent (OpenClaw `agents.entries`) | Model | Notes |
| --- | --- | --- |
| `sage-briefing` | Claude Sonnet 4.5 | triage → correlate → rank → `save_brief`, all in one multi-turn run |
| `sage-ask` | Claude Sonnet 4.5 | conversational drill-down, same MCP tools |

**Constraints — design around these from day one:**
- **Every tool is an MCP tool**, served by `agent/mcp` over streamable HTTP.
  OpenClaw's tool profile for both agents is `["mcp:sage"]` — no shell, browser,
  or filesystem tools. Don't widen this without updating ADR 0003.
- **No `cache_control` prompt caching**, no adaptive-thinking / effort control
  through the Ollama protocol. Keep system prompts lean; don't design around caching.
- **Structured output is enforced at the tool boundary**, not by a `format=`
  hint: `save_brief` validates against `sage_shared.types.MorningBrief` and
  returns a tool error the agent can see and retry from if the brief doesn't
  validate.
- **`sage-briefing` can't buy quality with a bigger model.** It comes from: a
  tight prompt, the `save_brief` schema boundary, good tools, and letting it
  take several tool-use turns (decompose → gather → synthesise).

---

## Sprint 1 · Sep 8–14 — endpoint proven, contracts frozen, MCP server up

- [ ] **Get the LLM endpoint from M4 — today.**
      *Done when:* you have `LLM_BASE_URL` + `LLM_API_KEY` + the model string, and
      you know whether it's native Ollama (`/api/chat`) or OpenAI-shaped (`/v1`).

- [ ] **🚨 Day-1 spike: does OpenClaw's `models.providers` accept this endpoint?**
      *Done when:* `openclaw.json5`'s `models.providers.sageOrganisers` resolves
      against the real endpoint and a manual `openclaw agent` (or
      `POST /v1/chat/completions`) call returns real text. This is the one real
      unknown in the OpenClaw swap — see ADR 0003. If it doesn't register
      cleanly, the fallback is a small OpenAI-shaped shim in front of the
      endpoint; decide that today, not in week 3.

- [ ] **MCP server skeleton** — `agent/mcp/src/sage_mcp/server.py`, `settings.py`
      *Done when:* `uv run sage-mcp` starts a streamable-HTTP MCP server and an
      MCP client (or `curl`) can list its (still-stub) tools.

- [ ] **Tool surface against stub signals** — `tools/{query_metric,list_metrics,
      get_signals,compare_period,trace_lineage}.py`
      *Done when:* all five are registered MCP tools with typed signatures. They
      may return canned/stub data this sprint, but the **signatures are final** —
      this is the contract frozen with M1.

- [ ] **🔒 Freeze the tool JSON schemas with M1** — [`../contracts/tool-schemas.md`](../contracts/tool-schemas.md)
      (now describing MCP tools, same shapes)
      *Done when:* the doc says "FROZEN" and is committed. **Deadline Sep 14.**

- [ ] **🔒 Freeze brief-JSON with M3** — [`../contracts/brief-json.md`](../contracts/brief-json.md)
      and `agent/shared/src/sage_shared/types.py`
      *Done when:* `MorningBrief` / `BriefItem` / `CausalChain` Pydantic models are
      final in `types.py`, the contract doc matches, and M3's `types.ts` mirrors it.
      **Deadline Sep 14.**

- [ ] **`save_brief` skeleton** — `tools/save_brief.py`
      *Done when:* it validates a payload against `MorningBrief` and returns a
      clear validation error for a malformed one (persistence can still be a stub).

- [ ] **`sage-briefing` agent config against stub signals** — `agent/openclaw/openclaw.json5`,
      `agent/openclaw/prompts/briefing.md`
      *Done when:* the agent is registered in OpenClaw, its tool profile is
      `["mcp:sage"]`, and a manual run against stub signals produces a
      structured (if rough) brief via `save_brief`.

**S1 gate:** the organisers' endpoint proven reachable through OpenClaw; MCP
server running with the tool contract frozen; `sage-briefing` configured and
runs end to end against stub data.

---

## Sprint 2 · Sep 15–21 — the vertical slice

- [ ] **`sage-briefing` on real signals** — `agent/openclaw/prompts/briefing.md`,
      `tools/get_signals.py`
      *Done when:* the agent reads M1's real `signals` table (via `get_signals`)
      for each of sales / inventory / accounting and produces triaged
      explanations, still single-domain at this point (no cross-domain
      correlation yet — that's Sprint 3).

- [ ] **Brief assembly + `save_brief`** — `tools/save_brief.py`,
      `agent/openclaw/prompts/briefing.md`
      *Done when:* a full `MorningBrief` (≤5 items, severity-ranked, in Mei's
      language, every number citing a metric id) is persisted via `save_brief`
      from real data. Emits the frozen brief-JSON.

- [ ] **`sage-ask` v1** — `agent/openclaw/openclaw.json5`, `agent/openclaw/prompts/ask.md`
      *Done when:* single-turn Q&A that answers a question with a metric-cited
      number using `query_metric` / `compare_period`, reachable through OpenClaw's
      `POST /v1/chat/completions`.

- [ ] **`sage_shared.openclaw` client** — `agent/shared/src/sage_shared/openclaw.py`
      *Done when:* `run_agent(agent_id, prompt, *, stream=...)` works against the
      real gateway for both a streaming and non-streaming call. The future backend and you
      (evals) both depend on this — agree the signature together before either
      builds on it.

**S2 gate (shared, Sep 21):** a real anomaly → `sage-briefing` → a real
`MorningBrief` rendered by M3 in a browser on the deployed instance.

---

## Sprint 3 · Sep 22–28 — the differentiator, then the number

- [ ] **Cross-domain correlation** — `agent/openclaw/prompts/briefing.md`
      *Done when:* `sage-briefing` produces cross-domain causal chains with
      `$`-impact ranking and a recommended action as text, under three hard
      constraints: (1) may only correlate **existing** signals from the
      `signals` table, (2) **must cite metric ids** for every number,
      (3) `save_brief` **rejects** anything that doesn't fit the `CausalChain`
      schema — no free-form.

- [ ] **Eval scoring functions** — `agent/evals/src/sage_evals/metrics.py`
      *Done when:* pure functions for detection recall, precision, correlation
      accuracy (chain vs. ground-truth chain), impact-estimation error, and lead
      time — unit-tested.

- [ ] **Eval harness** — `agent/evals/src/sage_evals/harness.py`
      *Done when:* `uv run sage-evals` replays the full pipeline over M1's **frozen
      dataset snapshot**, calling `sage-briefing` through `sage_shared.openclaw`
      with a **fresh OpenClaw session per case** (reused sessions carry history
      and will poison determinism), and scores against the incident library.

- [ ] **Eval report** — `agent/evals/src/sage_evals/report.py`
      *Done when:* the harness prints a slide-ready summary ("surfaced N of ~20, a
      median of X days earlier, precision Y") and writes JSON. Hand the number to M4.

- [ ] **Register the daily automation** — `agent/openclaw/automations/daily-brief.md`
      *Done when:* `openclaw automations create ...` is run on the deployed
      instance and `openclaw automations run sage-daily-brief` produces a real
      brief off-schedule, proving the job works before relying on its schedule.

- [ ] **One tuning pass** — `agent/openclaw/prompts/*.md`
      *Done when:* run the harness, adjust prompts once, re-run, record the delta.
      Wire `uv run sage-evals` into CI on agent-prompt changes (mind the shared
      endpoint's rate limits — don't loop the full pipeline more than needed).

**S3 gate (hard, Sep 28):** the hero scenario's causal chain, run unassisted from
the OpenClaw automation, matches the incident library's declared chain.

---

## What you hand off, and when

| To | Artifact | By |
| --- | --- | --- |
| M1 | Frozen MCP tool schemas (jointly) | Sep 14 |
| M3 | Frozen brief-JSON + `sage_shared.types` models | Sep 14 |
| M3 | `sage_shared.openclaw.run_agent` signature (agreed jointly, once the backend needs it) | Sep 16 |
| M3 | A real `MorningBrief` payload shape from `sage-briefing` | Sep 20 |
| M4 | The daily automation registered and proven with a manual run | Sep 25 |
| M4 | Eval headline number for the deck | Sep 27 |

## Your items on the cut list (if a sprint slips — order matters)

1. Ask chat richness → single-turn Q&A only, no inline charts.
2. (with M1) 3rd source Accounting → agents work with Sales + Inventory.

**Never cut:** `sage-briefing`'s cross-domain correlation, the eval harness.

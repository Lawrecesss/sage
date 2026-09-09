# M2 — Agent Engineer

## Lane summary

- **Owns:** Strands agents, tool surface, prompts, Bedrock integration, eval harness.
- **Backs up:** M1 on detectors.
- **Success test:** the eval harness runs and prints a number, and the hero
  scenario's causal chain matches the ground truth.
- **The Correlator/Analyst is the product.** Everything else in this lane exists to
  feed it and to prove it works.

## Skills this lane wants

Python, LLM prompting and tool-use design, and an instinct for measurement (the
eval harness is what defends the pitch on stage).

## Where your code goes

| Area | Path |
| --- | --- |
| Agent definitions | `packages/agents/src/sage_agents/{watcher,analyst,briefing,ask}.py` |
| Tools (client-side) | `packages/agents/src/sage_agents/tools/*.py` |
| Prompts | `packages/agents/src/sage_agents/prompts/*.md` |
| Bedrock / model config | `packages/agents/src/sage_agents/{models,config}.py` |
| Worker entrypoint | `packages/agents/src/sage_agents/runtime.py` |
| Eval harness | `packages/evals/src/sage_evals/{harness,metrics,report}.py` |

Run your tests with `uv run pytest packages/agents packages/evals`.

## Bedrock constraints — design around these from day one

No server-side web search, code execution, MCP connector, Managed Agents, Message
Batches or Files API. **Every tool is a client-side Python tool** (Strands' model
anyway). Prompt caching, structured outputs, adaptive thinking, effort control and
tool use all work. Cache the metric catalog + system prompt behind a
`cache_control` breakpoint — the single biggest cost lever. Model assignment:

| Agent | Model | Settings |
| --- | --- | --- |
| Analyst / Correlator | `anthropic.claude-opus-5` | `thinking: {"type": "adaptive"}`, `effort: "high"` |
| Briefing, Ask, Watcher | `anthropic.claude-sonnet-5` | Watcher `effort: "low"` |

---

## Sprint 1 · Sep 8–14 — Bedrock proven, contracts frozen, Watcher on stubs

- [ ] **Confirm Bedrock model access with M4 — today.** Approval can take days.
      *Done when:* either access is granted, or you've wired the **direct Anthropic
      API fallback** (Strands abstracts the provider; it's a config flip in
      `config.py`) so you're not blocked.

- [ ] **Model + agent config** — `packages/agents/src/sage_agents/models.py`,
      `config.py`
      *Done when:* `models.py` maps each agent to its Bedrock model ID from
      `Settings`; `config.py` holds per-agent effort / thinking / cache-breakpoint
      settings.

- [ ] **Strands + Bedrock hello-world**
      *Done when:* a trivial Strands agent calls Bedrock and returns text, run from
      `uv run python -m ...`. Proves the whole toolchain.

- [ ] **Tool surface against stub signals** — `tools/query_metric.py`,
      `tools/list_metrics.py`, `tools/get_signals.py`, `tools/compare_period.py`,
      `tools/trace_lineage.py`
      *Done when:* all five are Strands `@tool` functions with typed signatures. They
      may return canned/stub data this sprint, but the **signatures are final**.

- [ ] **🔒 Freeze the tool JSON schemas with M1** — [`../contracts/tool-schemas.md`](../contracts/tool-schemas.md)
      *Done when:* the doc says "FROZEN" and is committed. **Deadline Sep 14.**

- [ ] **🔒 Freeze brief-JSON with M3** — [`../contracts/brief-json.md`](../contracts/brief-json.md)
      and `packages/shared/src/sage_shared/types.py`
      *Done when:* `MorningBrief` / `BriefItem` / `CausalChain` Pydantic models are
      final in `types.py`, the contract doc matches, and M3's `types.ts` mirrors it.
      **Deadline Sep 14.**

- [ ] **Parameterised Watcher on stub data** — `watcher.py`, `prompts/watcher.md`
      *Done when:* `WatcherAgent(domain=...)` triages + explains a list of stub
      signals for one domain and returns a structured result.

**S1 gate:** hello-world Bedrock agent runs; both contracts signed and committed;
Watcher runs against stub signals for all 3 domains.

---

## Sprint 2 · Sep 15–21 — the vertical slice

- [ ] **Watcher on real signals** — `watcher.py`, `tools/get_signals.py`
      *Done when:* the Watcher reads M1's real `signals` table (via the tool) for
      each of sales / inventory / accounting and produces triaged explanations.

- [ ] **Briefing agent** — `briefing.py`, `prompts/briefing.md`
      *Done when:* it assembles a full `MorningBrief` (≤5 items, severity-ranked, in
      Mei's language, every number citing a metric id) from the Watcher output +
      signals. Emits the frozen brief-JSON.

- [ ] **Ask agent v1** — `ask.py`, `prompts/ask.md`
      *Done when:* single-turn Q&A that answers a question with a metric-cited
      number using `query_metric` / `compare_period`.

- [ ] **Worker orchestration** — `runtime.py`
      *Done when:* `runtime.py` parses an SQS message, runs Watcher (×3) → Briefing,
      and persists the `MorningBrief` to the `briefings` table. This is what M4's
      Lambda worker invokes.

- [ ] **Prompt caching** — `config.py`, agent construction
      *Done when:* the metric catalog + system prompt sit behind a `cache_control`
      breakpoint; verify cache-read tokens on the second call.

**S2 gate (shared, Sep 21):** a real anomaly → Watcher → Briefing → a real
`MorningBrief` rendered by M3 in a browser on AWS and pushed to a phone.

---

## Sprint 3 · Sep 22–28 — the differentiator, then the number

- [ ] **Correlator / Analyst agent** — `analyst.py`, `prompts/analyst.md`
      *Done when:* it produces cross-domain `CausalChain`s with `$`-impact ranking
      and a recommended action as text, under three hard constraints:
      (1) may only correlate **existing** signals from the `signals` table,
      (2) **must cite metric ids** for every number,
      (3) outputs a **strict schema** (`CausalChain` — no free-form).

- [ ] **Eval scoring functions** — `packages/evals/src/sage_evals/metrics.py`
      *Done when:* pure functions for detection recall, precision, correlation
      accuracy (chain vs. ground-truth chain), impact-estimation error, and lead
      time — unit-tested.

- [ ] **Eval harness** — `packages/evals/src/sage_evals/harness.py`
      *Done when:* `uv run sage-evals` replays the full pipeline over M1's **frozen
      dataset snapshot** and scores against the incident library.

- [ ] **Eval report** — `packages/evals/src/sage_evals/report.py`
      *Done when:* the harness prints a slide-ready summary ("surfaced N of ~20, a
      median of X days earlier, precision Y") and writes JSON. Hand the number to M4.

- [ ] **One tuning pass** — prompts + `config.py`
      *Done when:* run the harness, adjust prompts once, re-run, record the delta.
      Wire `uv run sage-evals` into CI on agent-prompt changes.

**S3 gate (hard, Sep 28):** the hero scenario's causal chain, run unassisted from a
scheduled trigger, matches the incident library's declared chain.

---

## What you hand off, and when

| To | Artifact | By |
| --- | --- | --- |
| M1 | Frozen tool JSON schemas (jointly) | Sep 14 |
| M3 | Frozen brief-JSON + `sage_shared.types` models | Sep 14 |
| M3 | A real `MorningBrief` payload shape from the worker | Sep 20 |
| M4 | `runtime.py` worker entrypoint + its SQS message contract | Sep 18 |
| M4 | Eval headline number for the deck | Sep 27 |

## Your items on the cut list (if a sprint slips — order matters)

1. Ask chat richness → single-turn Q&A only, no inline charts.
2. (with M1) 3rd source Accounting → agents work with Sales + Inventory.

**Never cut:** the Correlator agent, the eval harness.

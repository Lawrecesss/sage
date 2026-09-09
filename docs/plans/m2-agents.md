# M2 — Agent Engineer

## Lane summary

- **Owns:** Strands agents, tool surface, prompts, LLM integration, eval harness.
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
| Model / agent config | `packages/agents/src/sage_agents/{models,config}.py` |
| Worker loop | `packages/agents/src/sage_agents/runtime.py` |
| Eval harness | `packages/evals/src/sage_evals/{harness,metrics,report}.py` |

Run your tests with `uv run pytest packages/agents packages/evals`.

## LLM setup — one model, via the organisers' proxy

The LLM is the organisers' **Ollama-compatible, Bedrock-backed** endpoint. **One
model for every agent: Claude Sonnet 4.5** — no Opus, no Haiku, no per-tier scheme.

| Agent | Model | Notes |
| --- | --- | --- |
| Watcher (×3), Briefing, Ask, Analyst/Correlator | Claude Sonnet 4.5 | same everywhere |

**Constraints — design around these from day one:**
- **Every tool is a client-side Python tool** (Strands' model anyway).
- **No `cache_control` prompt caching**, no adaptive-thinking / effort control
  through the Ollama protocol. Keep system prompts lean; don't design around caching.
- **Structured outputs work** — use them for the Correlator's `CausalChain` schema.
- The **Correlator can't buy quality with a bigger model.** It comes from: a tight
  prompt, a strict output schema, good tools, and letting it take several tool-use
  turns (decompose → gather → synthesise).

---

## Sprint 1 · Sep 8–14 — LLM proven, contracts frozen, Watcher on stubs

- [ ] **Get the LLM endpoint from M4 — today.**
      *Done when:* you have `LLM_BASE_URL` + `LLM_API_KEY` + the model string, and
      you know whether it's native Ollama (`/api/chat`) or OpenAI-shaped (`/v1`).

- [ ] **Model + agent config** — `packages/agents/src/sage_agents/models.py`,
      `config.py`
      *Done when:* `models.py` has one `build_model()` →
      `OllamaModel(host=…, ollama_client_args={"headers": {"Authorization": f"Bearer {key}"}}, model_id=…)`
      (swap to `OpenAIModel`/`LiteLLMModel` if the endpoint is `/v1`); `config.py`
      holds per-agent temperature / max_tokens (no model field, no effort knobs).

- [ ] **Strands hello-world against the endpoint**
      *Done when:* a trivial Strands agent calls the endpoint and returns text, run
      from `uv run python -m ...`. Proves provider + auth + tool loop.

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

**S1 gate:** hello-world agent runs against the endpoint; both contracts signed and
committed; Watcher runs against stub signals for all 3 domains.

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

- [ ] **Worker loop** — `runtime.py`
      *Done when:* `python -m sage_agents.runtime` polls the `agent_runs` table,
      claims the oldest `queued` row (`SELECT ... FOR UPDATE SKIP LOCKED`), runs
      Watcher (×3) → Briefing, persists the `MorningBrief` to `briefings`, pushes via
      `sage_notifier`, marks the row `done`/`error`. M4 runs this as the `worker`
      container; agree the row shape with M4.

**S2 gate (shared, Sep 21):** a real anomaly → Watcher → Briefing → a real
`MorningBrief` rendered by M3 in a browser on the deployed instance and pushed to a phone.

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
      Wire `uv run sage-evals` into CI on agent-prompt changes (mind the shared
      endpoint's rate limits — don't loop the full pipeline more than needed).

**S3 gate (hard, Sep 28):** the hero scenario's causal chain, run unassisted from the
host cron, matches the incident library's declared chain.

---

## What you hand off, and when

| To | Artifact | By |
| --- | --- | --- |
| M1 | Frozen tool JSON schemas (jointly) | Sep 14 |
| M3 | Frozen brief-JSON + `sage_shared.types` models | Sep 14 |
| M3 | A real `MorningBrief` payload shape from the worker | Sep 20 |
| M4 | `sage_agents.runtime` worker loop + the `agent_runs` row shape it expects | Sep 18 |
| M4 | Eval headline number for the deck | Sep 27 |

## Your items on the cut list (if a sprint slips — order matters)

1. Ask chat richness → single-turn Q&A only, no inline charts.
2. (with M1) 3rd source Accounting → agents work with Sales + Inventory.

**Never cut:** the Correlator agent, the eval harness.

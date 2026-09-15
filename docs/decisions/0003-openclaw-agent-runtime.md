# 3. OpenClaw as the agent runtime; MCP as the tool boundary

Date: 2026-09-14 · Status: accepted · Supersedes the agent-framework, worker, and
scheduling parts of [0002](0002-lightsail-single-instance.md)

## Context

0002 froze Strands Agents SDK running in-process: `packages/agents` held four agent
modules, a client-side Python tool surface, and a `worker` container
(`sage_agents.runtime`) polling the `agent_runs` table.

The agentic approach changes. **OpenClaw** — a self-hosted agent gateway — now runs
on the Lightsail instance alongside an **MCP server** that exposes Sage's governed
tool surface. All user prompts still enter through the FastAPI backend; the backend
never talks to an LLM directly. It calls OpenClaw's HTTP API, and OpenClaw runs the
agent loop, calling Sage's tools over MCP.

## Decision

- **`packages/agents` → `agent/mcp` (`sage_mcp`).** It stops being an agent
  framework and becomes an MCP server. The five read tools
  (`list_metrics` / `query_metric` / `compare_period` / `get_signals` /
  `trace_lineage`) move over with **signatures unchanged** — that contract was
  already frozen with M1 and survives the swap. A new `save_brief` tool is the
  write boundary: it validates a brief against `sage_shared.types.MorningBrief`
  before persisting it, so a brief is schema-checked at the tool call, not hoped
  for from free-form model output.
- **Agent definitions live in OpenClaw config, not Python.** A new top-level
  `agent/openclaw/` directory holds the config template (`agents.entries`, MCP server
  registration, model provider), the prompts (the old `watcher.md` + `analyst.md`
  + `briefing.md` collapse into one `briefing` agent prompt: triage → correlate →
  rank by `$` impact → brief), and the daily automation definition.
- **OpenClaw owns orchestration.** The backend makes one call — "produce today's
  brief" — and the OpenClaw briefing agent runs the whole chain itself via MCP
  tools, ending in `save_brief`. The backend does not sequence watcher → correlator
  → briefing calls itself.
- **`agent_runs` stays; the `worker` container is deleted.** The API inserts a
  `queued` row and drives the OpenClaw call from a FastAPI background task. No
  separate long-running worker process to deploy or restart.
- **Scheduling moves to OpenClaw's built-in automations (cron).** The host
  `crontab` entry that POSTed `/api/brief/run` daily is removed; an OpenClaw
  automation wakes the briefing agent directly.
- **Two new internal-only services**: `mcp` (the tool server) and `openclaw` (the
  gateway). Neither is routed by Caddy — an OpenClaw bearer token is a full
  operator credential, and the gateway is not built to face the public internet.
- **Channel delivery is unresolved and out of scope for this change.**
  `platform/notifier` (Telegram) is left exactly as it is, unwired. Whether it
  stays as the deterministic push path or is replaced by OpenClaw's native
  Telegram channel is a separate decision.

## Consequences

**Lose:** a single Python process to step through for the whole agent chain — the
chain is now config + prompts in `agent/openclaw/`, executed by a runtime this repo
doesn't own the source of. Debugging crosses a process boundary (backend → HTTP →
gateway → MCP). One more moving part on the instance (six containers on a 4 GB
box — budget for a bump to `large_3_0` if it's tight).

**Gain:** the agent loop, tool-use retries, and structured-output handling are
OpenClaw's problem, not hand-rolled. Scheduling is agentic (an automation, not a
crontab curl) — a better demo story. The tool surface is enforced at a real
process boundary (MCP) instead of being "just Python functions an agent happens to
call in-process," which is a stronger governance story for the pitch. `save_brief`
makes brief-JSON schema-valid by construction, not by convention.

**Unresolved, deliberately:** the exact `openclaw` model-provider shape for the
organisers' Ollama-compatible endpoint. Config keys exist (`models.providers.*`)
but proving the organisers' endpoint registers cleanly is a day-1 spike, not
something this decision can freeze in advance.

**Still true from 0002:** one Lightsail instance, `docker-compose`, Postgres on
the instance disk, Caddy for TLS/routing, no auth for the demo, one model
(Claude Sonnet 4.5) for every agent.

**Update (post-restructure):** "the backend" throughout this decision was
FastAPI (`platform/api`) at the time it was written. The backend will now be
Next.js, built inside `apps/web`, not a separate Python service — see
docs/team-plan.md. Everything else in this decision (OpenClaw, MCP, the tool
boundary, `agent_runs`, no `worker` container, cron via OpenClaw automations)
stands unchanged; only the language calling the backend "FastAPI" is stale.

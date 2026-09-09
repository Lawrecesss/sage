# packages/agents

Strands agents, tool surface, prompts, LLM integration. Owned by M2. Watcher (per
domain) · Analyst/Correlator (the product) · Briefing · Ask, plus the `agent_runs`
worker loop (`sage_agents.runtime`). Every tool is a client-side Python tool. One
model for all agents — Claude Sonnet 4.5 — via the organisers' Ollama-compatible,
Bedrock-backed endpoint. No prompt caching / effort control through that path;
the Correlator relies on a strict output schema + multi-turn tools instead.

> STUB — structure only, no implementation yet.

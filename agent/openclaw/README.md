# agent/openclaw — the agent runtime

Owned by **M2**. This directory is *config, not code*: the OpenClaw agent
gateway is a container built from an upstream image, and this is what seeds it.
See [`../../docs/decisions/0003-openclaw-agent-runtime.md`](../../docs/decisions/0003-openclaw-agent-runtime.md).

```
agent/openclaw/
├── openclaw.json5           config template — mounted read-only at /seed in the
│                             `openclaw` container, copied to ~/.openclaw/openclaw.json
│                             on first boot if no config exists yet
├── prompts/
│   ├── briefing.md           sage-briefing agent — triage → correlate → rank →
│   │                          save_brief (collapses the old watcher/analyst/
│   │                          briefing chain into one multi-turn agent)
│   └── ask.md                 sage-ask agent — conversational drill-down
└── automations/
    └── daily-brief.md        the cron job that replaces the old host crontab
```

## How it's wired

- **Tool surface:** the `sage` MCP server (`agent/mcp`, container `mcp`) is
  the *only* way either agent touches Sage data — `mcp.servers.sage` in
  `openclaw.json5`, tool profile `["mcp:sage"]` on both agents. No shell,
  browser, or filesystem tools are enabled. Don't add any without updating
  ADR 0003's threat model.
- **Model provider:** the organisers' Ollama-compatible, Bedrock-backed
  endpoint, registered under `models.providers.sageOrganisers`. One model for
  every agent — Claude Sonnet 4.5, `LLM_MODEL` in `.env`.
- **Entry point:** `platform/api` calls this gateway's OpenAI-compatible
  `POST /v1/chat/completions` (`sage_shared.openclaw.run_agent`), never an LLM
  directly. `model: "openclaw/sage-briefing"` or `"openclaw/sage-ask"` selects
  the agent.
- **Scheduling:** an OpenClaw automation (`automations/daily-brief.md`) wakes
  `sage-briefing` on its own — no host cron.
- **Network:** the `openclaw` container is never published by docker-compose
  and never routed by Caddy. Its bearer token is a full operator credential —
  see `docs/decisions/0003-openclaw-agent-runtime.md` before changing that.

## Adding an agent

1. Write the prompt in `prompts/<name>.md`.
2. Add an entry under `agents.entries` in `openclaw.json5` — model, system
   prompt file, tool profile (`["mcp:sage"]` unless there's a real reason for
   more).
3. Point `sage_shared.settings` (and whichever `platform/api` router needs it)
   at the new agent id.

## Local dev

`docker compose --profile agent up -d` brings up `mcp` + `openclaw` alongside
`db`. `make agent-up` is the Makefile shortcut. The seeded config needs real
values for `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` / `OPENCLAW_TOKEN` in
`.env` — see `.env.example`.

> STUB — config templates and prompts are structure only; nothing here has been
> run against a real OpenClaw instance yet. The day-1 spike is confirming the
> organisers' endpoint registers cleanly under `models.providers` — see ADR 0003.

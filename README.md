# Sage

An agentic monitoring layer for retail / e-commerce SMEs.

## Layout

Each top-level folder is an independently buildable microservice: its own
`Dockerfile`, its own lockfile, no shared workspace. The root `docker-compose.yml`
wires them together.

- `mcp/` — MCP server, Sage's governed tool surface, served to OpenClaw
- `openclaw/` — agent runtime config (prompts, automations)
- `data/generator/` — synthetic dataset entity models
- `data/warehouse/` — star schema / metric layer
- `data/detectors/` — anomaly detection
- `data/evals/` — agent eval harness
- `platform/notifier/` — pushes the morning brief to Telegram
- `web/` — Next.js frontend

Most services are currently skeletons: entity/schema models only, business logic
not yet implemented.

## Running

```
docker compose up -d db mcp openclaw web
docker compose --profile jobs up generator warehouse detectors evals notifier
```

Copy `.env.example` to `.env` first.

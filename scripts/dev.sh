#!/usr/bin/env bash
# Run the MCP server, the API, and the web app locally, side by side.
# Ctrl-C stops all three. `openclaw` itself is docker-only — start it with
# `make agent-up` (or `docker compose --profile agent up -d openclaw`) if you
# need the full agent loop; the API and web app run fine without it for
# everything that doesn't call an agent.
set -euo pipefail
cd "$(dirname "$0")/.."

trap 'kill 0' EXIT

uv run sage-mcp &
uv run uvicorn sage_api.main:app --reload --port 8000 &
pnpm --filter web dev &

wait

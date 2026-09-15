#!/usr/bin/env bash
# Run the MCP server and the web app locally, side by side. Ctrl-C stops both.
# `openclaw` itself is docker-only — start it with `make agent-up` (or
# `docker compose --profile agent up -d openclaw`) if you need the full agent
# loop; the web app runs fine without it for everything that doesn't call an
# agent. The web app's own dev server will serve API routes once the Next.js
# backend is built — no separate API process here.
set -euo pipefail
cd "$(dirname "$0")/.."

trap 'kill 0' EXIT

uv run sage-mcp &
pnpm --filter web dev &

wait

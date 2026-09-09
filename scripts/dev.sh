#!/usr/bin/env bash
# Run the API and the web app locally, side by side. Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."

trap 'kill 0' EXIT

uv run uvicorn sage_api.main:app --reload --port 8000 &
pnpm --filter web dev &

wait

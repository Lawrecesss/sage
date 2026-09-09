#!/usr/bin/env bash
# One-time local setup.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Python workspace (uv sync)"
uv sync --all-packages

echo "==> Web app (pnpm install)"
pnpm install

echo "==> Local Postgres (docker compose)"
docker compose up -d db

echo "==> Env files"
[ -f .env ] || { cp .env.example .env && echo "   created .env"; }
[ -f apps/web/.env.local ] || { cp apps/web/.env.local.example apps/web/.env.local && echo "   created apps/web/.env.local"; }

cat <<'EOF'

Done. Next:
  ./scripts/seed-demo.sh    # generate dataset, load warehouse, run detectors
  ./scripts/dev.sh          # run API + web app
EOF

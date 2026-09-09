#!/usr/bin/env bash
# Generate the synthetic dataset, load the warehouse, run the detectors.
# NOTE: the underlying commands are stubs until M1 Sprint 1–2 — this script is the
# intended entrypoint and wiring, so it lands now.
set -euo pipefail
cd "$(dirname "$0")/.."

MONTHS="${SAGE_GEN_MONTHS:-12}"
SEED="${SAGE_GEN_SEED:-42}"

echo "==> Generate synthetic SME data (${MONTHS} months, seed ${SEED})"
uv run sage-generate generate --months "$MONTHS" --seed "$SEED" --out ./data

echo "==> Apply schema + load warehouse"
uv run sage-warehouse init-db
uv run sage-warehouse load ./data

echo "==> Run detectors -> signals table"
uv run sage-detectors run

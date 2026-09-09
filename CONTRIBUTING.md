# Contributing

## Prerequisites

- Python 3.12 (`uv` will fetch it if missing) · [uv](https://docs.astral.sh/uv/)
- Node 20 · [pnpm](https://pnpm.io/) (`corepack enable`)
- Docker (local Postgres)

## Setup

```bash
./scripts/bootstrap.sh   # uv sync, pnpm install, start Postgres, create .env files
```

## Everyday commands

| Command | What |
| --- | --- |
| `./scripts/dev.sh` | API (`:8000`) + web app (`:3000`) with reload |
| `make test` | `uv run pytest` + web tests |
| `make lint` | ruff + mypy + `next lint` |
| `make fmt` | `ruff format` |
| `make eval` | run the agent eval harness |
| `uv run pytest packages/detectors` | one package's tests |

## Workspace layout

- **Python** — a `uv` workspace. Every `packages/*` (and `infra/`) is a member with
  its own `pyproject.toml`. Add a dependency with
  `uv add --package sage-<name> <dep>`. Cross-package deps resolve automatically.
- **Web** — a `pnpm` workspace with a single member, `apps/web`.
- Lockfiles (`uv.lock`, `pnpm-lock.yaml`) are committed — keep them in sync.

## Branching & PRs

- Branch off `main`: `m<lane>/<short-topic>` (e.g. `m2/watcher-agent`).
- CI must be green (`.github/workflows/ci.yml`).
- **Contracts before code.** A change to `docs/contracts/` (tool schemas,
  brief-JSON, API shapes) needs sign-off from both owners — see `docs/team-plan.md`.
- Anything that doesn't show in the demo or move the eval number is a stretch item.

## Optional: pre-commit

```bash
uv tool install pre-commit && pre-commit install
```

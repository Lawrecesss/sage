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
| `./scripts/dev.sh` | MCP server + API (`:8000`) + web app (`:3000`) with reload |
| `make agent-up` | `mcp` + `openclaw` in docker, for the full agent loop |
| `make test` | `uv run pytest` + web tests |
| `make lint` | ruff + mypy + `next lint` |
| `make fmt` | `ruff format` |
| `make eval` | run the agent eval harness |
| `uv run pytest data/detectors` | one package's tests |

## Workspace layout

- **Python** — a `uv` workspace, members grouped by topic: `data/{generator,warehouse,detectors}`,
  `agent/{mcp,evals}`, `platform/{api,notifier}`, `shared`. Each has its own
  `pyproject.toml`. Add a dependency with `uv add --package sage-<name> <dep>`.
  Cross-package deps resolve automatically. (`platform/infra/` and `agent/openclaw/`
  are plain config/deploy kits — no Python, not workspace members.)
- **Web** — a `pnpm` workspace with a single member, `apps/web`.
- Lockfiles (`uv.lock`, `pnpm-lock.yaml`) are committed — keep them in sync.

## Branching & PRs

- Branch off `main`: `m<lane>/<short-topic>` (e.g. `m2/briefing-prompt`).
- PRs are auto-labelled from the files they touch (`data/metrics`, `agent`,
  `frontend`, `backend`, `infra`, …) — see `.github/labeler.yml`. CI runs only the
  jobs those paths need (per-package `pytest`, web build, eval).
- CI must be green — the `ci-ok` check in `.github/workflows/ci.yml`.
- **Contracts before code.** A change to `docs/contracts/` (tool schemas,
  brief-JSON, API shapes) needs sign-off from both owners — see `docs/team-plan.md`.
- Anything that doesn't show in the demo or move the eval number is a stretch item.

## Optional: pre-commit

```bash
uv tool install pre-commit && pre-commit install
```

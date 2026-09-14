"""FastAPI app factory; mounts routers (health, brief, runs, signals, ask); CORS
for the web app.

Served by uvicorn in a container, behind Caddy (`/api/*` → this app). No Mangum,
no Lambda. `uv run uvicorn sage_api.main:app --reload` locally. This process is
the only public entry point that talks to OpenClaw — see sage_api.agent and
docs/decisions/0003-openclaw-agent-runtime.md.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/plans/m4-platform.md for what belongs here.
"""

# TODO: implement

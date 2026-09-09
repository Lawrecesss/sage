"""FastAPI app factory; mounts routers; CORS for the web app.

Served by uvicorn in a container, behind Caddy (`/api/*` → this app). No Mangum,
no Lambda. `uv run uvicorn sage_api.main:app --reload` locally.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/plans/m4-platform.md for what belongs here.
"""

# TODO: implement

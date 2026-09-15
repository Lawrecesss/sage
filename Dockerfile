# Python image for the `mcp` service (agent/shared is nested under agent/, so
# one COPY covers both). The backend will be a separate Next.js app (apps/web),
# not built from this image — see docs/decisions/0003-openclaw-agent-runtime.md.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# Dependency layer — cached unless the lockfile or a pyproject changes.
COPY pyproject.toml uv.lock .python-version ./
COPY data ./data
COPY agent ./agent
COPY platform ./platform
RUN uv sync --frozen --no-dev --all-packages

# Source
COPY . .

# compose always sets `command: sage-mcp` for the `mcp` service — this default
# just makes `docker run` on this image alone do something sane.
CMD ["sage-mcp"]

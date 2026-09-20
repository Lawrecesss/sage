FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

<<<<<<< Updated upstream
# No committed uv.lock yet (deps changed with the retail-mcp rename) — run
# `uv lock` locally and commit the result for reproducible builds.
COPY pyproject.toml ./
RUN uv sync --no-dev --no-install-project

COPY src ./src
RUN uv sync --no-dev
=======
COPY mcp/pyproject.toml mcp/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY mcp/src ./src
# metrics.yaml lives at the repo root (shared source of truth for the governed metric
# layer), not under mcp/ — that's why the build context is the repo root, not ./mcp.
COPY metrics.yaml ./metrics.yaml
RUN uv sync --frozen --no-dev
>>>>>>> Stashed changes

CMD ["retail-mcp"]

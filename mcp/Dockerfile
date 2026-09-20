FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# No committed uv.lock yet (deps changed with the retail-mcp rename) — run
# `uv lock` locally and commit the result for reproducible builds.
COPY pyproject.toml ./
RUN uv sync --no-dev --no-install-project

COPY src ./src
RUN uv sync --no-dev

CMD ["retail-mcp"]

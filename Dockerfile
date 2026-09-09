# Python image for the `api` and `worker` services (same image, different command —
# the command is set per-service in infra/docker-compose.prod.yml).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# Dependency layer — cached unless the lockfile or a pyproject changes.
COPY pyproject.toml uv.lock .python-version ./
COPY packages ./packages
RUN uv sync --frozen --no-dev --all-packages

# Source
COPY . .

EXPOSE 8000
# Overridden in compose; this default runs the API.
CMD ["uvicorn", "sage_api.main:app", "--host", "0.0.0.0", "--port", "8000"]

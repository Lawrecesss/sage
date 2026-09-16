# Build context is `./data` (see docker-compose.yml) so this Dockerfile can see
# the sibling `models/` package that `simulator`'s pyproject.toml path-depends on.
# Everything is copied under /build/simulator + /build/models to mirror that same
# sibling layout, so the "../models" path source resolves identically to local dev.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /build
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY models ./models
COPY simulator/pyproject.toml simulator/uv.lock ./simulator/
WORKDIR /build/simulator
RUN uv sync --frozen --no-dev --no-install-project

COPY simulator/src ./src
RUN uv sync --frozen --no-dev

ENV PATH="/build/simulator/.venv/bin:$PATH"
CMD ["python", "-c", "print('sage-simulator — entity models only, no CLI yet')"]

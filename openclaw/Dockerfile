FROM ghcr.io/openclaw/openclaw:2026.9.4

# Config and workspace live outside ~/.openclaw so the state volume mounted
# there never shadows them; rebuilding the image always picks up changes.
ENV OPENCLAW_CONFIG_PATH=/opt/sage/openclaw.json

# Emit the standard gen_ai.* span attributes instead of OpenClaw's legacy
# openclaw.model.call ones — Langfuse renders model, usage and cost from those.
ENV OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental

COPY --chown=node:node openclaw.json /opt/sage/openclaw.json
COPY --chown=node:node render-otel.mjs /opt/sage/render-otel.mjs
COPY --chown=node:node workspace /opt/sage/workspace
COPY --chown=node:node docker-entrypoint.sh /opt/sage/docker-entrypoint.sh

# The base image runs as node, so these need root — render-otel.mjs writes
# otel.json into the config dir at start-up ($include refuses paths outside it),
# which means node must own the directory, not just the files in it.
USER root
RUN chown node:node /opt/sage && chmod +x /opt/sage/docker-entrypoint.sh
USER node

EXPOSE 18789
# Prefixed to CMD rather than set as ENTRYPOINT so the base image's tini
# entrypoint (signal handling, reaping) stays in place; the script exec's the
# gateway, so it doesn't add a process layer.
CMD ["/opt/sage/docker-entrypoint.sh", "node", "openclaw.mjs", "gateway", "run"]

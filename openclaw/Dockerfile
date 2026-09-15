FROM ghcr.io/openclaw/openclaw:2026.9.4

# Config and workspace live outside ~/.openclaw so the state volume mounted
# there never shadows them; rebuilding the image always picks up changes.
ENV OPENCLAW_CONFIG_PATH=/opt/sage/openclaw.json
COPY --chown=node:node openclaw.json /opt/sage/openclaw.json
COPY --chown=node:node workspace /opt/sage/workspace

EXPOSE 18789
CMD ["node", "openclaw.mjs", "gateway", "run"]

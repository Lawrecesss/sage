#!/bin/sh
# Generate the Langfuse OTLP block openclaw.json $includes, then hand off to the
# gateway. Runs on every start so rotating a key only needs a container restart.
set -e

node /opt/sage/render-otel.mjs

exec "$@"

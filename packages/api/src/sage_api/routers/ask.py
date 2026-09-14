"""POST /ask (SSE stream) — proxies the sage-ask OpenClaw agent.

Calls sage_api.agent.stream_ask(prompt) and forwards the SSE chunks straight
through via sse-starlette's EventSourceResponse. The web app's SSE contract
(apps/web/src/lib/api-client.ts) doesn't change — only what's on the other end
of this router does (OpenClaw instead of an in-process Strands agent).

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/decisions/0003-openclaw-agent-runtime.md.
"""

# TODO: implement

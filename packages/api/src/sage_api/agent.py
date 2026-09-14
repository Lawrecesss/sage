"""Wraps sage_shared.openclaw for the API — resolves agent ids, maps errors.

The API is the only public entry point and never calls an LLM directly; every
agentic call goes through OpenClaw's HTTP API (`sage_shared.openclaw.run_agent`).
This module is where that gets an HTTP-error shape:

    async def run_briefing(prompt: str) -> MorningBrief:
        \"\"\"Calls sage_shared.openclaw.run_agent(settings.openclaw_agent_briefing, ...),
        non-streaming. Raises HTTPException(502) if OpenClaw is unreachable or
        returns a non-2xx; HTTPException(500) if the response can't be parsed
        into a MorningBrief (should be rare — save_brief validates on the MCP
        side, so a malformed response here means the agent returned prose
        instead of calling the tool).
        \"\"\"

    async def stream_ask(prompt: str) -> AsyncIterator[str]:
        \"\"\"Calls sage_shared.openclaw.run_agent(settings.openclaw_agent_ask,
        stream=True) and re-yields SSE-formatted chunks for
        sage_api.routers.ask to forward as-is.
        \"\"\"

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/decisions/0003-openclaw-agent-runtime.md.
"""

# TODO: implement

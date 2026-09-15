"""Thin HTTP client for OpenClaw's OpenAI-compatible chat-completions endpoint.

Used by `agent/evals` (to replay the frozen dataset through the same path
production uses). The backend will be Next.js, not Python, so it will most
likely call OpenClaw's HTTP endpoint directly rather than through this client
— see docs/team-plan.md. Nothing else in this repo should call an LLM endpoint
directly — see docs/decisions/0003-openclaw-agent-runtime.md.

Expected shape:

    import httpx

    async def run_agent(
        agent_id: str,
        prompt: str,
        *,
        stream: bool = False,
    ) -> dict | AsyncIterator[dict]:
        \"\"\"POST {openclaw_base_url}/v1/chat/completions with
        model="openclaw/{agent_id}" and an Authorization: Bearer {openclaw_token}
        header. stream=True yields parsed SSE `data:` chunks as they arrive;
        stream=False returns the final JSON response (used by the eval harness).

        Raises on a non-2xx response or a malformed SSE frame — callers decide
        how to map that to their own error handling (e.g. the eval harness
        records it as a failed case).
        \"\"\"

Session note: OpenClaw sessions carry conversation history server-side. The eval
harness MUST start a fresh session per replayed case (however that's addressed —
e.g. a fresh conversation/session id per call) or scores drift run to run.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/decisions/0003-openclaw-agent-runtime.md.
"""

# TODO: implement

"""LLM model construction.

One model for every agent: Claude Sonnet 4.5, via the organisers' Ollama-compatible
endpoint (Bedrock-backed). No per-tier selection — Opus/Haiku are not available.

    from strands.models.ollama import OllamaModel

    def build_model() -> OllamaModel:
        s = get_settings()
        return OllamaModel(
            host=s.llm_base_url,
            ollama_client_args={"headers": {"Authorization": f"Bearer {s.llm_api_key}"}},
            model_id=s.llm_model,            # e.g. "claude-sonnet-4-5"
        )

M2: confirm on day 1 whether the endpoint speaks native Ollama (/api/chat) or the
OpenAI shape (/v1) — if the latter, swap to strands.models.openai.OpenAIModel or
strands.models.litellm.LiteLLMModel. All Strands providers share the
`Agent(model=...)` interface, so it's a one-line change.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/plans/m2-agents.md for what belongs here.
"""

# TODO: implement

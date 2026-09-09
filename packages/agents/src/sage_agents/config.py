"""Per-agent config: temperature, max_tokens, tool-loop limits.

No model field (there's only one model) and no Bedrock-only knobs (`cache_control`
breakpoints, adaptive thinking, effort control) — the Ollama-proxy path doesn't
expose them. The Correlator's reliability comes from a constrained output schema +
good tools + multiple tool-use turns, not from a bigger model or effort dials.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/plans/m2-agents.md for what belongs here.
"""

# TODO: implement

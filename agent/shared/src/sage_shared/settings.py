"""Shared env-driven settings.

Fields (pydantic-settings, read from environment / .env):
  database_url         postgresql+psycopg://sage:...@db:5432/sage
  llm_base_url          organisers' Ollama-compatible endpoint (Bedrock-backed);
                         consumed by the `openclaw` container as its model
                         provider (agent/openclaw/openclaw.json5), not called from
                         Python directly
  llm_api_key            bearer token for that endpoint
  llm_model              the only allowed model, e.g. "claude-sonnet-4-5"
  openclaw_base_url      internal URL of the OpenClaw gateway, e.g.
                         "http://openclaw:18789" — used by sage_shared.openclaw
  openclaw_token          bearer token for the OpenClaw gateway (full operator
                         access — internal network only, never logged)
  openclaw_agent_briefing / openclaw_agent_ask   agent ids OpenClaw exposes
                         (default "sage-briefing" / "sage-ask")
  mcp_url                 internal URL of the MCP server, e.g.
                         "http://mcp:9100/mcp" (consumed by openclaw.json5)
  telegram_bot_token / telegram_chat_id   platform/notifier — currently unwired,
                         see docs/decisions/0003-openclaw-agent-runtime.md
  sage_dataset_snapshot / sage_gen_seed / sage_gen_months

No AWS / Bedrock / SQS / S3 settings — see docs/decisions/0002-lightsail-single-instance.md.
No `sage_agents` / worker settings — the agent runtime is OpenClaw, see
docs/decisions/0003-openclaw-agent-runtime.md.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/plans/m1-data-metrics.md for what belongs here.
"""

# TODO: implement

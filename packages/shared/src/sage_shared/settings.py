"""Shared env-driven settings.

Fields (pydantic-settings, read from environment / .env):
  database_url        postgresql+psycopg://sage:...@db:5432/sage
  llm_base_url        organisers' Ollama-compatible endpoint (Bedrock-backed)
  llm_api_key         bearer token for that endpoint
  llm_model           the only allowed model, e.g. "claude-sonnet-4-5"
  sage_domain         public hostname (Caddy / CORS)
  cors_allow_origins  list[str]
  telegram_bot_token / telegram_chat_id
  sage_dataset_snapshot / sage_gen_seed / sage_gen_months

No AWS / Bedrock / SQS / S3 settings — see docs/decisions/0002-lightsail-single-instance.md.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/plans/m1-data-metrics.md for what belongs here.
"""

# TODO: implement

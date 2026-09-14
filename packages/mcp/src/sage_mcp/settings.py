"""MCP server settings.

Fields (pydantic-settings, read from environment / .env):
  database_url   read via sage_shared.settings — same warehouse Postgres
  mcp_host       bind host, default 0.0.0.0
  mcp_port       bind port, default 9100 (internal network only — never
                 published by docker-compose, never routed by Caddy)

No LLM / OpenClaw settings here — this package only serves tools; it never calls
a model itself. See docs/decisions/0003-openclaw-agent-runtime.md.

STUB — structure only, no implementation yet.
"""

# TODO: implement

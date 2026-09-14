"""Tool: save_brief(run_id, brief) -> { brief_id }.

The write boundary the rest of the tool surface doesn't have. The `sage-briefing`
OpenClaw agent calls this once, at the end of its run, instead of just emitting
JSON and hoping it's well-formed:

  1. validate `brief` against `sage_shared.types.MorningBrief` (Pydantic) — a
     malformed brief is a tool error the agent can see and retry from, not a
     silent bad payload reaching the API
  2. persist it to the `briefings` table
  3. mark the matching `agent_runs` row `done` (or `error`, with the validation
     failure, if this is reached after a retry budget is exhausted)

This is what makes brief-JSON schema-valid by construction — see
docs/contracts/brief-json.md and docs/decisions/0003-openclaw-agent-runtime.md.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/contracts/tool-schemas.md for what belongs here.
"""

# TODO: implement

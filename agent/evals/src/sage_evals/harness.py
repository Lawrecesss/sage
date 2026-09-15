"""Replay: frozen dataset -> detectors -> sage-briefing (via OpenClaw) -> score
vs incident library.

Drives the same path production uses — `sage_shared.openclaw.run_agent` against
the `sage-briefing` agent id — not an in-process agent call. **Start a fresh
OpenClaw session per replayed case**: OpenClaw sessions carry history
server-side, and reusing one across cases would poison determinism (a later
case's brief could be influenced by an earlier one's conversation).

See docs/decisions/0003-openclaw-agent-runtime.md.

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/eval-plan.md for what belongs here.
"""

# TODO: implement

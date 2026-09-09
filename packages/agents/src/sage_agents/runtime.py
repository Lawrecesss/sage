"""Worker entrypoint — the `worker` container runs `python -m sage_agents.runtime`.

Loop:
  1. poll the `agent_runs` table for the oldest row with status 'queued'
  2. claim it: SELECT ... FOR UPDATE SKIP LOCKED  → status 'running'
  3. run the pipeline for its as_of_date: Watcher ×3 → Correlator → Briefing
  4. persist the MorningBrief to `briefings`; push via sage_notifier
  5. mark the row 'done' (or 'error' with the traceback)
  6. sleep briefly, repeat

No SQS / Lambda — see docs/decisions/0002-lightsail-single-instance.md.
`main()` is the console-script entrypoint (`sage-worker`).

STUB — structure only, no implementation yet.
See docs/architecture.md and docs/plans/m2-agents.md for what belongs here.
"""


def main() -> None:
    raise NotImplementedError("agent worker loop — M2 Sprint 2")


if __name__ == "__main__":
    main()

# agent/evals

Agent eval harness. Owned by M2. Replays the frozen dataset through the full
pipeline — detectors, then the `sage-briefing` OpenClaw agent via
`sage_shared.openclaw` (a fresh session per case) — and scores recall /
correlation accuracy / impact error / lead time / precision. This number goes on
a slide — see docs/eval-plan.md.

> STUB — structure only, no implementation yet.

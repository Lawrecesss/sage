# Automation: daily-brief

Replaces the old host `crontab` entry (`/etc/cron.d/sage-briefing` → `curl -XPOST
/api/brief/run`) — see docs/decisions/0003-openclaw-agent-runtime.md. OpenClaw's
built-in scheduler wakes the `sage-briefing` agent directly; no HTTP round trip
through the API needed for the scheduled path (the API's `POST /brief/run` still
exists for the manual "run it now" trigger from the web app).

## Registration

Run once per instance, after the `openclaw` container is up and `sage-briefing` is
configured (not declared in `openclaw.json5` — automations are managed as data,
via the CLI or the gateway's automation API):

```bash
# TODO: confirm exact syntax against the installed OpenClaw version once the
# day-1 spike (docs/decisions/0003, "Unresolved, deliberately") lands.
openclaw automations create \
  --name sage-daily-brief \
  --schedule "0 6 * * *" \            # 06:00 instance time — same time as the old cron
  --agent sage-briefing \
  --prompt "Produce today's morning brief." \
  --on-failure webhook:${SAGE_BRIEF_FAILURE_WEBHOOK}   # optional — see below
```

## Failure handling

If the run fails (tool error budget exhausted, `save_brief` validation keeps
failing, model timeout), the automation should not leave the demo without a
brief. Options carried over from the old worker's graceful-degradation story
(docs/plans/m4-platform.md):

- `GET /brief/latest` in the API always serves the last **successful** brief —
  a failed automation run doesn't overwrite it.
- Point `--on-failure` at a webhook the API exposes (or a log line tailed on
  screen during the demo) so a failure is visible, not silent.

## Verification

```bash
openclaw automations list                 # job is registered, enabled
openclaw automations run sage-daily-brief  # trigger it once, off-schedule, to prove it works
```

STUB — structure only; the exact CLI/API shape needs a day-1 spike against the
installed OpenClaw version.

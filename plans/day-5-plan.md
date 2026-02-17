# Day 5 Plan: OpenClaw Ops Autopilot + KPI Digests

## Objective
Operationalize OpenClaw as a low-noise, high-signal incident and metrics channel for AlcoMatcher production.

## Scope
1. Tiered severity alerts with dedupe/cooldowns.
2. Twice-daily KPI digest to Telegram.
3. Live drill for warn/critical/recovery verification.

## Implemented Artifacts
- `infra/openclaw/monitor-alerts.sh`
- `infra/openclaw/send-kpi-digest.sh`
- `infra/openclaw/send-telegram.sh`
- `infra/openclaw/lib/lib-alert-state.sh`
- `infra/openclaw/lib/lib-alert-rules.sh`
- `infra/openclaw/alcomatcher-openclaw-monitor.service`
- `infra/openclaw/alcomatcher-openclaw-digest.service`
- `infra/openclaw/alcomatcher-openclaw-digest.timer`
- `infra/openclaw/alcomatcher-openclaw-alerts.service` (legacy alias)
- `infra/openclaw/alert-scanner-failures.sh` (legacy wrapper)

## Alert Policy (Locked)
- Severity model: `info`, `warn`, `critical`.
- Rolling window: 15 minutes.
- Critical triggers:
  - repeated `/health` failures
  - 5xx burst threshold
  - scanner latency SLO breach
- Warn triggers:
  - scanner failure burst
  - sync-failed growth
  - telemetry completeness drop
- Recovery events emit one `info` alert when an active incident clears.

## Digest Policy (Locked)
- Cadence: 08:00 and 18:00 VM local time.
- Includes:
  - scan p50/p95 and decision p50/p95
  - fallback rate and confidence
  - telemetry complete/partial
  - sync health and deltas vs previous digest

## Acceptance Criteria
1. Monitor service running and sending tiered alerts to Telegram.
2. Digest timer active and next run scheduled.
3. Drill mode emits synthetic warn/critical/recovery messages.
4. No uncontrolled duplicate alert spam under steady-state.

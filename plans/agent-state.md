# Agent State Reconstitution (AlcoMatcher)

Use this file to quickly restore context after restarting Codex.

## Current Mission
- Ship scanner-first compliance app to `alcomatcher.com`.
- Keep no-login scan/result loop as primary user path.
- Deliver offline-first OCR/validation with selective cloud fallback.

## Infrastructure Snapshot
- Host: DigitalOcean Ubuntu VM `206.189.73.31` (hostname `alcobot`)
- Domain: `alcomatcher.com`
- Reverse proxy: Nginx
- Runtime: server-side services containerized by default (Docker Compose local + production); mobile apps run natively
- Deploy: GitHub Actions -> image build/push -> SSH rollout on DO VM
- Mobile CI/CD: TestFlight and Play Internal workflows
- Ops assistant: OpenClaw on same VM, localhost-only

## Locked Decisions
- Ionic React + Capacitor app shell.
- OCR matrix:
  - iOS: VisionKit/Vision
  - Android: ML Kit v2
  - Tesseract: fallback/benchmark
- Architecture: Event Sourcing + CQRS
- Local-first sync: `ComplianceApplication` as CRDT document with auto-sync to server
- KPI targets:
  - <= 5s p50 single-scan result
  - 200-300 batch uploads supported

## Data/Workflow Model
- Aggregate root: `ComplianceApplication`
- Local document model: CRDT-backed `ComplianceApplication` document on device
- Immutable event stream for all user/system actions.
- Projection-based current status and dashboard views.
- Itemized checks required for transparency and reports.

## Active Process
- Follow Ralph Wiggum Loop for multi-agent iteration.
- Gate every release slice by explicit acceptance criteria.

## Primary Docs to Open First
1. `alcomatcher/plans/release-plan-v1.md`
2. `alcomatcher/plans/decisions.md`
3. `alcomatcher/plans/sources.md`
4. `alcomatcher/AGENTS.md`

## Quick Start Prompt for Future Sessions
"Use `alcomatcher/AGENTS.md` and `alcomatcher/plans/release-plan-v1.md` as source of truth. Continue delivery-first implementation with scanner-first UX, offline-first OCR matrix, event-sourced CQRS workflow, and KPI targets."

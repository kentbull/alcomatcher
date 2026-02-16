# AlcoMatcher Agent Instructions

This file defines persistent working rules for Codex/agents in this repository.

## 1. Product Priority
- Prioritize scanner-first, no-login first value.
- Do not introduce auth gating before scan/result loop.
- Default to offline-first behavior; cloud is fallback.
- Design by persona:
  - Mobile UX targets a grandma-friendly Compliance Field Agent.
  - Web UX targets a more sophisticated Compliance Administrator.

## 2. Architectural Requirements
- Model compliance reviews as `ComplianceApplication` aggregates.
- Treat each `ComplianceApplication` as a local-first CRDT document.
- Use Event Sourcing + CQRS:
  - Commands write immutable events.
  - Query/read models are projection-based.
- Sync CRDT operations to server when connectivity is available.
- Maintain normalized command-side schemas and denormalized query-side views.
- Preserve immutable history of user/system actions.
- Default runtime is containerized for server-side services only (not mobile app runtime).

## 3. OCR and Vision Matrix (Locked)
- iOS: VisionKit DataScanner + Vision OCR.
- Android: ML Kit Text Recognition v2.
- Tesseract: fallback/benchmark only.
- Cloud OCR/LLM: fallback-only for low-confidence or conflicting decisions.

## 4. KPI and Performance Constraints
- Scanner matcher p50 <= 5 seconds.
- Support batch uploads of 200-300 labels.
- Preserve per-item status visibility and failure isolation in batch workflows.

## 5. Coding Principles
- Enforce SOLID design principles.
- Prefer composition over inheritance.
- Keep functions small, focused, and semantically named.
- Optimize for readability over cleverness.
- Add docs for exported functions/classes/modules.
- Add concise context comments where behavior is non-obvious.

## 6. Workflow Requirements
- Maintain transparent itemized compliance checks and report generation.
- Ensure status transitions come from events, not ad-hoc mutations.
- Default to optimistic local updates with background sync and visible `pending_sync` state.
- Use loading dialogs only for actions requiring server-authoritative responses.
- Keep deployment delivery-first: web first, mobile iterative.

## 7. Ralph Wiggum Loop (Execution Process)
For each delivery slice, follow:
1. Record current facts/blockers.
2. Assign focused workstreams.
3. Lock acceptance criteria.
4. Produce smallest shippable increment.
5. Harden with tests/smoke checks.
6. Write back decisions and docs.
7. Inspect KPI movement.
8. Gate on acceptance criteria.
9. Go deploy.
10. Update backlog and next slice.
11. Merge verified changes.

## 8. Source of Truth Files
- Plan: `alcomatcher/plans/release-plan-v1.md`
- References: `alcomatcher/plans/sources.md`
- ADRs: `alcomatcher/plans/decisions.md`
- Session reconstitution: `alcomatcher/plans/agent-state.md`

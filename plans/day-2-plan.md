# Day 2 Plan: Event-Sourcing + Projection Hardening (Completed)

## Status
Completed on Tuesday, February 17, 2026.

## Summary
Day 2 delivered the hardening goals:
1. projection-first decisioning,
2. normalized itemized compliance reporting,
3. deterministic CRDT conflict testing,
4. CI regression gates.

## Completed Outcomes (Definition of Done)
1. Application status/read models are deterministically derived from event streams.
2. Compliance reports contain complete itemized metadata (`ruleId`, `severity`, `evidenceText`, `citationRef`, `failureReason`).
3. CRDT conflict resolution is deterministic/idempotent under replay and concurrent operation ordering.
4. Automated tests enforce these guarantees in CI.

## Implemented Artifacts
- `apps/server/src/services/projectionService.ts`
- `apps/server/src/services/complianceCheckService.ts`
- `apps/server/src/services/rules/distilledSpiritsRuleMap.ts`
- `apps/server/src/services/crdtMergeService.ts`
- `apps/server/src/services/complianceService.ts` (wired to projection/check normalization/CRDT merge)
- `apps/server/test/projection.reducer.test.ts`
- `apps/server/test/crdt.merge.test.ts`
- `apps/server/test/report.itemization.test.ts`
- `apps/server/package.json` (`test` script)
- `.github/workflows/ci.yml` (test gate added)

## Verification Completed
1. `npm run typecheck` passed.
2. `npm run test` passed.
3. `npm run build` passed.
4. Production smoke checks passed for:
   - `/health`
   - scanner session flow
   - `/api/applications/:applicationId/projection`
   - `/api/applications/:applicationId/report`
   - `/api/admin/queue`
5. SSE focused timing pass completed with real-time `application.status_changed` delivery around finalize boundary.

## Remaining Work (Moved to Day 3)
- UX cleanup to avoid JSON-first/operator-only surfaces in web/admin flows.
- Human-readable report/inspection UI for admins in addition to machine JSON endpoints.

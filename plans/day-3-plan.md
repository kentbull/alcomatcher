# Day 3 Plan: UX Consolidation + Human-Readable Admin Workflows

## Objective
Move from functional backend completeness to polished, production-friendly UX.
Primary Wednesday goal: remove JSON-first user experiences and replace them with human-readable, scanner/admin-first flows.

## Why This Day Matters
Current platform behavior is technically correct, but parts of the experience still expose raw JSON links/pages in normal operator paths. That is useful for engineering/debugging but not acceptable as primary UX.

## Definition of Done (Wednesday)
1. No primary navigation path for scanner/admin users lands on raw JSON.
2. Admin queue provides an in-app detail view (not JSON dump) for compliance reports.
3. Scanner result and admin detail experiences are visually consistent with brewery/winery theme.
4. Loading/working/error states are present for all async UX-critical actions.
5. API JSON remains available behind explicit "Developer" affordances, not default UX actions.

## Scope

### A. Admin Queue and Report UX Rewrite
1. Replace queue "Report -> JSON" link with:
   - `View Report` (human-readable page/modal)
   - optional secondary `JSON` link under "Developer Tools" disclosure.
2. Build report UI sections:
   - Decision summary (status, confidence, sync state, generated time)
   - Itemized checks table/cards (rule, status, severity, evidence, citation, failure reason)
   - Extracted fields block
   - Event timeline (human-readable labels + timestamps)
3. Add clear back navigation from report detail to queue.

### B. Scanner UX Final Pass (Web + Capacitor WebView)
1. Ensure scan flow remains camera-first and transparent overlay behavior is preserved on iOS.
2. Remove legacy form clutter in scanner route where present (expected fields only under optional "Advanced" disclosure).
3. Ensure fast visual feedback states:
   - per-image status: uploading/processing/ready/failed
   - actionable retry on failed image uploads
4. Align controls with current iconography (`+` for scan another, send glyph for finalize).

### C. Async Feedback and Error Handling Standardization
1. Add common async state patterns across views:
   - loading spinner/skeleton
   - non-blocking progress text
   - actionable error states with retry
2. Standardize user-facing error language:
   - no raw exception strings
   - concise problem + next action
3. Maintain request reference IDs in developer/debug panel only.

### D. UX Guardrails for JSON Surfaces
1. Keep API endpoints unchanged for integrations.
2. Remove direct raw JSON links from primary page CTAs.
3. Add optional developer panel/toggle for:
   - copy API endpoint
   - open JSON payload
   - request IDs / debug metadata

### E. Visual QA + Cross-Surface Validation
1. Mobile web and iOS (iPhone 13 Pro Max baseline):
   - safe-area padding
   - no status-bar collisions
   - no opaque scanner layer regressions
2. Admin pages (mobile + desktop):
   - table readability
   - tap target sizing
   - no overflow/cutoff
3. Brand/theme consistency pass:
   - typography weights
   - contrast ratios
   - icon clarity at small sizes

## Technical Work Items
1. `apps/server/src/routes/site.ts`
   - add/replace admin report HTML route(s)
   - replace queue report JSON-first links with human-readable route
2. `apps/web/src/*`
   - scanner and admin UI consistency cleanup (if served via web app routes)
3. Shared style tokens
   - keep brown/gold woodland theme and ensure contrast
4. Optional
   - add server-rendered report partial helpers for maintainability

## Acceptance Criteria
1. Admin can open a report from queue without seeing JSON.
2. Report page includes all normalized compliance metadata:
   - `ruleId`, `severity`, `evidenceText`, `citationRef`, `failureReason`.
3. Scanner flow on iOS keeps transparent camera UX and safe-area-compliant top layout.
4. Any failed async action shows retry affordance.
5. Public pages `/`, `/scanner`, `/admin/queue`, `/admin/report/:applicationId` return usable themed UI.

## Test Plan
1. Manual E2E:
   - scan front/back
   - finalize
   - open admin queue
   - open report detail
   - verify itemized checks/timeline
2. SSE sanity:
   - queue auto-refreshes on `application.status_changed`
3. Regression checks:
   - `/health` OK
   - existing API JSON endpoints still functional for developer tooling

## Out of Scope (Wednesday)
- Major DB schema refactor
- New regulatory profile expansion beyond existing mapped behavior
- Full native-only camera pipeline rewrite

## Implementation Order (Suggested)
1. Admin report detail UX route + queue link rewrite.
2. Scanner page clutter removal + advanced section toggle.
3. Async state and error-message unification.
4. QA sweep on iOS + mobile web + desktop admin.
5. Deploy and run smoke + SSE refresh check.

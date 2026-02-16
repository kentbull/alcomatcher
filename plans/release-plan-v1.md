# AlcoMatcher V1 Delivery Plan (Scanner-First, Offline-First)

## 1. Objective
Ship a scanner-first compliance checker that:
- Launches directly into scanner before login.
- Returns compliance results in 5 seconds or less for single scans (p50 target).
- Supports batch uploads of 200-300 labels.
- Requires authentication only for save/export/workflow actions.
- Treats each `compliance_application` as a local-first document synced with server via CRDTs.
- Is live on `alcomatcher.com` today, with mobile CI/CD in place today.

## 2. Locked Product and Architecture Decisions
- App framework: Ionic React + Capacitor.
- Hosting: DigitalOcean Ubuntu VM at `206.189.73.31` behind Nginx.
- Runtime model: server-side services are containerized by default (local and production).
- Delivery model: web production first, iterative mobile releases.
- Processing model: offline-first with selective cloud fallback.
- Compliance scope for v1: Distilled Spirits rulepack first.
- Architecture style: Event Sourcing + CQRS for compliance application lifecycle.
- Sync model: CRDT-based document sync for `compliance_application` with automatic offline-to-online reconciliation.

## 3. Locked OCR and Vision Decision Matrix
- iOS primary OCR/scanner: Apple VisionKit DataScanner + Vision text recognition (local, on-device).
- Android primary OCR: Google ML Kit Text Recognition v2 (local, on-device).
- Tesseract role: fallback/benchmark only, not primary mobile OCR path.
- Cloud OCR/LLM role: fallback only when local confidence is low, fields are unresolved, or rules conflict.

## 4. Core UX for Release 1 (No-Login First Value)
1. App launch opens scanner immediately.
2. User scans label (live camera first, image import fallback).
3. Local extraction + validation run.
4. Result screen appears quickly with:
   - Overall status: `Pass`, `Fail`, `Needs Review`
   - Itemized check list with evidence and reason
   - `Rescan` as primary action
   - `Save Result` as secondary action
5. Authentication appears only when user attempts save/export/workflow features.

## 4.1 UX Personas and Surface Strategy
### Persona A: Compliance Field Agent (Mobile-First)
- Profile: non-technical, speed-focused, "grandma-friendly" interaction model.
- Primary device: mobile app (Ionic + Capacitor).
- Primary jobs:
  - scan label immediately
  - get pass/fail/needs-review quickly
  - rescan or submit to workflow with minimal taps
- UX requirements:
  - scanner is default first screen
  - large tap targets and high-contrast controls
  - plain-language status and reasons
  - minimal navigation depth and no mandatory setup before first scan

### Persona B: Compliance Administrator (Web-First)
- Profile: more technical, workflow/oversight focused.
- Primary device: web app at `alcomatcher.com`.
- Primary jobs:
  - manage compliance queue and batch uploads
  - review itemized checks and reports
  - monitor KPIs, sync health, and operational exceptions
- UX requirements:
  - dense but readable queue/table workflows
  - filtering/sorting by status, source, and confidence
  - report export and audit timeline visibility
  - clear operational dashboards for throughput and quality

## 5. Compliance Workflow Queue Model
### 5.1 Compliance Application Entity
A compliance application is the aggregate root for all review activity.
It is represented client-side as a local-first CRDT document.

Core fields:
- `application_id`
- `application_doc_id` (CRDT document identifier)
- `submission_type` (`single`, `batch`)
- `regulatory_profile` (`distilled_spirits`, `wine`, `malt_beverage`)
- `status` (state machine below)
- `created_at`, `updated_at`
- `last_synced_at`

### 5.2 State Machine
- `captured` -> `scanned` -> `matched` -> (`approved` | `rejected` | `needs_review`)
- Batch-specific transient states: `batch_received`, `batch_processing`, `batch_partially_failed`, `batch_completed`

State transitions are derived from immutable events, not direct record mutation.
Document-level changes are merged via CRDT operations, then projected into event-sourced state transitions.

### 5.3 Itemized Compliance Checks
Each result includes a transparent check list for reporting and audit.

Check item schema:
- `check_id`
- `rule_id`
- `label` (human-readable)
- `status` (`pass`, `fail`, `not_evaluable`)
- `severity` (`hard_fail`, `soft_fail`, `advisory`)
- `confidence`
- `evidence_text`
- `citation_ref`
- `failure_reason`

### 5.4 Compliance Report Outputs
Generate report for both successful and rejected end states.

Report sections:
- application summary
- scan metadata (device/mode/source)
- itemized checks
- final decision + rationale
- reviewer override (if any)
- event timeline (immutable history)

## 6. Event Sourcing + CQRS Design
### 6.1 Event Sourcing Rules
- Every user/system action emits an immutable event.
- No in-place mutation of historical actions.
- Summary states are projections over event streams.

### 6.2 Command Side (Normalized)
Normalized write models:
- `compliance_applications`
- `application_events`
- `scan_attempts`
- `review_actions`
- `batch_jobs`
- `batch_items`

Example immutable events:
- `ApplicationCreated`
- `ScanCaptured`
- `OCRCompleted`
- `ChecksEvaluated`
- `CloudFallbackRequested`
- `DecisionComputed`
- `ReviewerOverrideRecorded`
- `BatchQueued`
- `BatchItemCompleted`
- `BatchCompleted`

### 6.3 Query Side (Denormalized Projections)
Read models:
- `application_current_status_view`
- `application_check_summary_view`
- `batch_progress_view`
- `kpi_dashboard_view`

## 6.4 Local-First CRDT Sync Model
- `compliance_application` is edited locally first and persisted on device immediately.
- Sync engine pushes CRDT ops to server when connectivity is available.
- Server merges CRDT updates and appends canonical immutable events.
- Query projections update from canonical events and are pulled back to clients.

### 6.4.1 Primary Sync Points
- Sync scan results after local check completion (non-blocking background sync).
- Sync authenticated workflow actions (`save`, `approve`, `reject`, `needs_review`, notes) immediately with retry queue.
- Sync batch item updates incrementally instead of waiting for full batch completion.

### 6.4.2 UX Behavior for Sync
- Default behavior: optimistic local updates and background sync.
- Show lightweight sync indicator for pending/failed sync state.
- Use loading dialogs only for actions that require authoritative server state:
  - account linking/authentication-bound save
  - export/report generation
  - workflow actions requiring server-side policy/rbac checks

## 7. Batch Uploads (200-300) and Schema
### 7.1 Supported Inputs
- ZIP archive of images (`.jpg`, `.jpeg`, `.png`, `.heic`)
- Optional CSV manifest for expected fields and IDs

### 7.2 Batch Manifest CSV Schema
Required columns:
- `client_label_id`
- `image_filename`
- `regulatory_profile`

Optional columns:
- `expected_brand_name`
- `expected_class_type`
- `expected_abv_text`
- `expected_net_contents`
- `expected_warning_text`
- `expected_country_of_origin`

### 7.3 Batch API Contract
`POST /api/batches`
- multipart form with ZIP + optional CSV

Response:
- `batch_id`
- `total_items`
- `accepted_items`
- `rejected_items`
- `status_url`

## 8. Offline-First Processing Modes
- `strict_offline`: local only, never cloud.
- `hybrid` (default): local first, cloud fallback on ambiguity.
- `cloud_preferred`: cloud path for benchmark/testing.

Cloud fallback triggers in `hybrid` mode:
- OCR confidence below threshold.
- Required fields unresolved after local parsing.
- Rule conflict or ambiguous decision.
- Manual reviewer request for second opinion.

## 9. Hosting and Deployment (DigitalOcean)
### 9.1 Production Host
- Provider: DigitalOcean
- VM: Ubuntu
- IP: `206.189.73.31`
- Hostname: `alcobot`
- Reverse proxy: Nginx
- App runtime: Docker Compose (containerized services)

### 9.1.1 Container Baseline
- Local and production use the same Compose topology for server-side services.
- Minimum services:
  - `app` (web/api service)
  - `worker` (async jobs/batch processing)
  - `db` (Postgres for local dev; production may use managed Postgres)
  - optional `redis` (queue/cache)
- Nginx proxies to `app` container endpoint.
- Mobile apps are built by CI/CD and run natively on devices; they are not containerized.

### 9.2 Domain and TLS
- DNS:
  - `@ -> 206.189.73.31`
  - `www -> 206.189.73.31` (or redirect)
- Nginx enforces HTTPS redirect and proxies to app port.
- TLS via Let’s Encrypt with automated renewal.

### 9.3 GitHub Actions Web Deploy
Workflow: `deploy-web-do.yml`
- Trigger: push to `main` and manual dispatch.
- Build and tag container image in CI.
- Push image to container registry.
- Deploy via SSH to `alcobot` and run Compose pull/up.
- Restart services via Compose rollout.
- Health checks (`/health`, scanner route, production URL).
- Automatic rollback on failed post-deploy checks.

Required secrets:
- `DO_HOST=206.189.73.31`
- `DO_USER`
- `DO_SSH_PRIVATE_KEY`
- `DO_SSH_PORT` (if non-default)
- `REGISTRY_USERNAME`
- `REGISTRY_TOKEN`
- production env vars

### 9.4 Local Developer Runtime
- Default local startup for server stack: `docker compose up`.
- No required host-level Node/Postgres install for standard dev path.
- Keep one-command bootstrap for new contributors using `.env.example` + Compose.

## 10. Mobile CI/CD (Today)
### 10.1 iOS Pipeline
Workflow: `mobile-ios.yml`
- Build Ionic assets.
- Capacitor sync iOS.
- Xcode archive and sign.
- Upload to TestFlight.

### 10.2 Android Pipeline
Workflow: `mobile-android.yml`
- Build Ionic assets.
- Capacitor sync Android.
- Build signed artifact.
- Upload to Play Internal Testing.

## 11. OpenClaw Integration (Dev/Admin/Ops)
Install and run OpenClaw on the same VM as an internal operations assistant.

Use cases:
- Deployment status summarization.
- Incident triage and log interpretation.
- Runbook execution support (health checks, rollback, cert checks).

Operational constraints:
- Separate service/user.
- Localhost-only bind.
- SSH tunnel access.
- Non-customer-facing.

## 12. Ralph Wiggum Loop (Multi-Agent Collaboration)
Use the "Ralph loop" as a repeating multi-agent execution cycle.

Loop steps:
1. `R`ecord: capture latest facts, requirements, and blockers.
2. `A`ssign: split work across focused agents (frontend, backend, infra, QA).
3. `L`ock: define acceptance criteria for each work item before coding.
4. `P`roduce: implement smallest shippable slice.
5. `H`arden: run tests, smoke checks, rollback checks.
6. `W`riteback: update ADRs, plan state, and release notes.
7. `I`nspect: review KPIs and defect drift.
8. `G`ate: release only if criteria pass.
9. `G`o: deploy and monitor.
10. `U`pdate: log learnings and reprioritize next slice.
11. `M`erge: integrate verified changes and repeat.

## 13. Test Data Strategy
- Synthetic corpus (AI-generated) as primary iteration set.
- Real-world mini-corpus (10-20 labels) for realism validation.
- Golden regression set (30-50 labels) for deterministic checks.

## 14. KPI Targets
Primary KPIs:
- Scanner matcher p50 result time: <= 5 seconds.
- Batch ingestion capacity: 200-300 labels accepted in one upload.
- CRDT sync success rate: >= 99.9% operation delivery without manual conflict resolution.

Secondary KPIs:
- p95 single-scan result time <= 8 seconds.
- Cloud fallback rate trend decreases over time.
- Queue completion reliability for 300-item batch >= 99% successful processing (excluding malformed files).
- Median offline-to-online sync catch-up for typical user session <= 3 seconds after reconnection.

## 15. Full Week Delivery Plan and Acceptance Criteria
### Monday (Today, Feb 16, 2026)
Scope:
- Production deploy to `alcomatcher.com`
- Scanner-first no-login flow
- Local OCR integration baseline
- GitHub Actions web deploy and mobile build pipelines operational

Acceptance:
- Scanner opens first on launch.
- Anonymous scan-to-result works.
- Save prompts auth.
- DO deploy workflow passes and updates production.
- At least one successful iOS and Android CI build.
- Local scan result is stored immediately and marked `pending_sync` when offline.
- Mobile UX passes field-agent checklist (large controls, plain status language, <=3 taps to first result after camera open).
- Containerized local stack boots successfully with `docker compose up`.

### Tuesday (Feb 17, 2026)
Scope:
- Event store + command models implemented.
- Status projection/read models implemented.
- Itemized checks + evidence displayed in UI.
- CRDT document model + sync queue implemented for `compliance_application`.

Acceptance:
- All scan decisions generated from event stream projections.
- Compliance report includes itemized checks and rationale.
- No direct mutable decision writes bypassing command/event path.
- CRDT conflict merges are deterministic in test scenarios with concurrent edits.

### Wednesday (Feb 18, 2026)
Scope:
- Batch upload ingestion (ZIP + optional CSV manifest)
- Queue processing for 200-300 uploads
- Batch progress/status APIs and UI
- Incremental CRDT sync for batch item statuses and authenticated review actions

Acceptance:
- 200-item and 300-item test uploads accepted.
- Per-item status visible with retry/failure reasons.
- Batch report export available.
- Batch status remains usable offline and auto-reconciles on reconnect.
- Web UX passes admin checklist (queue filters, itemized check transparency, export path, status drill-down).

### Thursday (Feb 19, 2026)
Scope:
- Cloud fallback path hardening
- KPI dashboard projections
- OpenClaw runbooks and incident flows
- Sync observability (lag, retries, conflict metrics)

Acceptance:
- Hybrid fallback only triggers on defined rules.
- KPI dashboard shows latency and throughput trends.
- OpenClaw can summarize deployment and current service health.
- Dashboard exposes CRDT sync lag, retry count, and unresolved conflict count.
- Container image rollout and rollback on `alcobot` are both validated.

### Friday (Feb 20, 2026)
Scope:
- Production hardening and polish
- App Store review response package
- Final docs + demo flow

Acceptance:
- End-to-end demo runs without manual intervention.
- All acceptance criteria Monday-Thursday remain green.
- Documentation complete: setup, architecture, ADRs, ops runbooks.
- Reconnect demo proves offline edits and scan results auto-sync correctly.

### Compressed Delivery Path (If Most Work Lands Today)
If Monday delivers all core slices, reclassify Tue-Fri to stabilization:
- Tue: load/perf and regression hardening
- Wed: UX refinements + accessibility
- Thu: reliability drills + rollback rehearsals
- Fri: release monitoring + postmortem + v1.1 planning

## 16. Coding Principles (Enforced)
- Use SOLID design principles.
- Prefer composition over inheritance.
- Prefer small, semantically meaningful functions.
- Optimize code for human readability.
- Add documentation for all exported functions/classes/modules.
- Add context comments only where behavior is non-obvious.

## 17. Risks and Mitigations
- App Store review timing risk:
  - Mitigation: submit tonight; web stays primary live channel.
- OCR variability risk:
  - Mitigation: local confidence thresholds + cloud fallback + regression corpus.
- Batch reliability risk:
  - Mitigation: queue retries, per-item error isolation, explicit failure reporting.
- Operational instability risk:
  - Mitigation: health checks, rollback workflow, OpenClaw-assisted runbooks.

## 18. Reference Index
See `alcomatcher/plans/sources.md` for bibliography and references.
See `alcomatcher/plans/decisions.md` for ADR log and rationale.
See `alcomatcher/AGENTS.md` and `alcomatcher/plans/agent-state.md` for agent-state reconstitution.

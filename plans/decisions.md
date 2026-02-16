# ADR Log: AlcoMatcher V1

## ADR-001: Scanner-First Default Entry
- Status: Accepted
- Date: 2026-02-16
- Decision:
  - App opens directly into scanner before login or any workflow screens.
- Rationale:
  - Minimizes time-to-value and matches core user intent: instant pattern match/compliance check.
- Consequences:
  - Navigation and onboarding are deferred or secondary.
  - Auth must be progressive and non-blocking.

## ADR-002: Authentication Boundary
- Status: Accepted
- Date: 2026-02-16
- Decision:
  - Anonymous scanning is allowed.
  - Authentication is required only for saving scans, exports, and workflow integration.
- Rationale:
  - Preserves instant usability while still enabling persistent enterprise workflows.
- Consequences:
  - Anonymous state management required on-device.
  - Data persistence paths split by auth state.

## ADR-003: Offline-First Processing
- Status: Accepted
- Date: 2026-02-16
- Decision:
  - Local processing is primary; cloud processing is fallback-only for ambiguous cases.
- Rationale:
  - Supports restricted or unstable networks and lowers latency for common cases.
- Consequences:
  - Confidence scoring and fallback triggers are required.
  - Dual-path validation behavior must be observable and testable.

## ADR-004: OCR/Vision Matrix
- Status: Accepted
- Date: 2026-02-16
- Decision:
  - iOS primary: Apple VisionKit DataScanner + Vision OCR.
  - Android primary: Google ML Kit Text Recognition v2.
  - Tesseract: fallback/benchmark only.
- Rationale:
  - Best fit for mobile-first live scanning performance and user experience.
- Consequences:
  - Platform-specific OCR adapters required.
  - Benchmark tests should include Tesseract for quality/cost comparison.

## ADR-005: Hosting and Release Infrastructure
- Status: Accepted
- Date: 2026-02-16
- Decision:
  - Production web hosted on DigitalOcean Ubuntu VM (`206.189.73.31`) behind Nginx.
  - CI/CD deploys to VM via GitHub Actions.
- Rationale:
  - Immediate control and delivery velocity with existing provisioned infrastructure.
- Consequences:
  - Team owns runtime operations, security hardening, and rollback mechanisms.

## ADR-006: OpenClaw Operations Assistant
- Status: Accepted
- Date: 2026-02-16
- Decision:
  - Install OpenClaw on production VM as internal Dev/Admin/Ops assistant.
  - Keep OpenClaw private (localhost + SSH tunnel), non-customer-facing.
- Rationale:
  - Improves deployment visibility, incident response, and runbook execution speed.
- Consequences:
  - Must enforce strict privilege boundaries and isolate OpenClaw service credentials.
  - OpenClaw availability must not affect customer traffic.

## ADR-007: Compliance Scope for V1
- Status: Accepted
- Date: 2026-02-16
- Decision:
  - Distilled Spirits rulepack is v1 target.
  - Wine and malt beverage support remain scaffolded for near-term expansion.
- Rationale:
  - Focused scope increases probability of shipping high-quality behavior quickly.
- Consequences:
  - Product messaging must clearly indicate v1 coverage.

## ADR-008: Test Corpus Strategy
- Status: Accepted
- Date: 2026-02-16
- Decision:
  - Use AI-generated synthetic labels as primary iteration corpus.
  - Add a smaller real-world corpus for realism checks.
  - Maintain a golden regression subset for deterministic CI.
- Rationale:
  - Maximizes iteration speed without dependence on manual field collection.
- Consequences:
  - Requires metadata discipline for expected outcomes and defect tags.

## ADR-009: Delivery Priority
- Status: Accepted
- Date: 2026-02-16
- Decision:
  - Web production release to `alcomatcher.com` today is the first milestone.
  - Mobile pipelines are established in parallel and iteratively improved.
- Rationale:
  - Ensures a publicly accessible, demoable product immediately while mobile review cycles run.
- Consequences:
  - Operations and monitoring for web become critical from day one.

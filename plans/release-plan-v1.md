# AlcoMatcher V1 Delivery Plan (Scanner-First, Offline-First)

## 1. Objective
Ship a scanner-first compliance checker that:
- Launches directly into scanner before login.
- Returns fast compliance results from local processing.
- Requires authentication only for saving scans and workflow integration.
- Is live on `alcomatcher.com` today.
- Has iOS/Android CI/CD established today.

## 2. Locked Product and Architecture Decisions
- App framework: Ionic React + Capacitor.
- Hosting: DigitalOcean Ubuntu VM at `206.189.73.31` with Nginx.
- Delivery model: web production first, iterative mobile releases.
- Processing model: offline-first with selective cloud fallback.
- Compliance scope for v1: Distilled Spirits rulepack first.

## 3. Locked OCR and Vision Decision Matrix
- iOS primary OCR/scanner: Apple VisionKit DataScanner + Vision text recognition (local, on-device).
- Android primary OCR: Google ML Kit Text Recognition v2 (local, on-device).
- Tesseract role: fallback/benchmark only, not primary mobile OCR path.
- Cloud OCR/LLM role: fallback only when local confidence is low or rules conflict.

## 4. Core UX for Release 1 (No-Login First Value)
1. App launch opens scanner immediately.
2. User scans label (live camera first, image import as fallback).
3. Local extraction + validation run.
4. Result screen appears quickly with:
   - Overall status (`Pass`, `Fail`, `Needs Review`)
   - Field-by-field checks with reason and evidence
   - `Rescan` as primary action
   - `Save Result` as secondary action
5. Authentication prompt appears only when user attempts to save/export/workflow.

## 5. Compliance and Validation Engine (V1)
- Rule checks include:
  - Brand name
  - Class/type
  - Alcohol content
  - Net contents
  - Government health warning
  - Name/address
  - Country of origin for imports (where applicable)
- Each check emits:
  - `rule_id`
  - `status`
  - `severity` (`hard_fail`, `soft_fail`, `advisory`, `not_evaluable`)
  - `confidence`
  - `evidence_text`
  - `citation_ref`
- Result metadata includes:
  - `decision_source` (`local`, `local_plus_cloud`, `cloud`)
  - `fallback_trigger_reason`
  - `rulepack_version`

## 6. Offline-First Processing Modes
- `strict_offline`: local only, never cloud.
- `hybrid` (default): local first, cloud fallback on ambiguity.
- `cloud_preferred`: cloud path used for benchmark/testing workflows.

Cloud fallback triggers in `hybrid` mode:
- OCR confidence below threshold.
- Required fields unresolved after local parsing.
- Rule conflict or ambiguous decision.
- Manual reviewer request for second opinion.

## 7. Hosting and Deployment (DigitalOcean)
### 7.1 Production Host
- Provider: DigitalOcean
- VM: Ubuntu
- IP: `206.189.73.31`
- Reverse proxy: Nginx
- App process manager: `systemd`

### 7.2 Domain and TLS
- DNS:
  - `@ -> 206.189.73.31`
  - `www -> 206.189.73.31` (or redirect)
- Nginx configured for HTTPS redirect and reverse proxy to app port.
- TLS via Let’s Encrypt + automated renewal.

### 7.3 GitHub Actions Web Deploy
Workflow: `deploy-web-do.yml`
- Trigger: push to `main` and manual dispatch.
- Build artifact in CI.
- Deploy artifact to VM over SSH.
- Restart app service.
- Run health checks (`/health`, scanner route, production URL).
- Rollback to previous release on failed health checks.

Required GitHub secrets:
- `DO_HOST=206.189.73.31`
- `DO_USER`
- `DO_SSH_PRIVATE_KEY`
- `DO_SSH_PORT` (if non-default)
- Production app env vars.

## 8. Mobile CI/CD (Today)
### 8.1 iOS Pipeline
Workflow: `mobile-ios.yml`
- Build Ionic assets.
- Capacitor sync iOS.
- Xcode archive and sign.
- Upload to TestFlight.

### 8.2 Android Pipeline
Workflow: `mobile-android.yml`
- Build Ionic assets.
- Capacitor sync Android.
- Build signed artifact.
- Upload to Play Internal Testing.

## 9. OpenClaw Integration (Dev/Admin/Ops)
Install and run OpenClaw on the same VM as an internal operations assistant.

Use cases:
- Deployment status summarization.
- Incident triage and log interpretation.
- Runbook execution support (health checks, rollback steps, cert checks).

Operational constraints:
- Run as separate service/user.
- Bind to localhost only.
- Access via SSH tunnel.
- Not customer-facing and not on critical serving path.

## 10. Test Data Strategy
- Synthetic corpus (AI-generated) as primary iteration set.
- Real-world mini-corpus (10-20 labels) for realism validation.
- Golden regression set (30-50 labels) for deterministic baseline checks.

## 11. Today’s Delivery Sequence (Delivery-First)
1. Provision app runtime + Nginx on `206.189.73.31`.
2. Configure DNS and TLS for `alcomatcher.com`.
3. Deploy scanner-first web app live today.
4. Wire GitHub Actions deploy-to-DO and verify end-to-end.
5. Install/configure OpenClaw for ops support.
6. Stand up iOS/Android CI/CD and run first successful builds.
7. Submit iOS build to App Store review tonight.

## 12. Acceptance Criteria for Today
- `https://alcomatcher.com` is live and opens scanner first.
- Anonymous scan-to-result works without login.
- Save action prompts auth and works post-auth.
- GitHub Actions deploy updates production successfully.
- OpenClaw is installed, private, and usable for ops workflows.
- At least one successful iOS and Android CI build completed.

## 13. Risks and Mitigations
- App Store review timing risk:
  - Mitigation: submit tonight; keep web production as primary live channel.
- OCR variability risk:
  - Mitigation: local-first confidence thresholds + targeted cloud fallback + synthetic regression set.
- Operational instability risk:
  - Mitigation: health checks, rollback workflow, OpenClaw-assisted runbooks.

## 14. Reference Index
See `alcomatcher/plans/sources.md` for bibliography and supporting references.
See `alcomatcher/plans/decisions.md` for ADR log and rationale.

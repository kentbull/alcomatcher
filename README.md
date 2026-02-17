# AlcoMatcher Foundation

Scanner-first, offline-first compliance platform foundation for week one.

## Monorepo Layout
- `apps/server`: API + domain foundations (event-sourcing/CQRS + CRDT sync contracts)
- `apps/web`: Ionic React scanner-first shell
- `infra/nginx`: Nginx reverse proxy config for `alcomatcher.com`
- `.github/workflows`: CI/CD scaffolding

## Quick Start (Server Stack)
1. Copy `.env.example` to `.env` and adjust if needed.
2. Start server-side runtime:
   - `docker compose up --build`
3. Verify API health:
   - `curl http://localhost:3000/health`

## Local App Development
- Server: `npm run dev:server`
- Web scanner shell: `npm run dev:web`

## Mobile Testing
- Browser test (fastest):
  - Open `https://alcomatcher.com/scanner` on your phone browser.
  - Capture/import a label image and run quick check.
- Native iOS build path (Capacitor):
  - `cd apps/web`
  - `npm run cap:sync`
  - `npm run cap:open:ios` (open Xcode project)
  - Build/run from Xcode to your connected iPhone.

## Notes on OCR Runtime
- Current OCR for quick check runs on server-side local Tesseract.
- Your iPhone/browser uploads image to server for OCR and check evaluation.
- We are not shipping native Tesseract binaries inside the iOS app in this slice.
- Upload limit for scanner photos is `12MB` (Nginx ingress allows up to `15MB`).

## Architecture Notes
- `ComplianceApplication` is modeled as a local-first CRDT document synced to the server.
- Server state remains event-sourced and query projections are derived from immutable events.

## CRDT Sync API (Week-One Foundation)
- Push local operations:
  - `POST /api/applications/:applicationId/crdt-ops`
  - body: `{ "actorId": "device-or-user-id", "ops": [{ "sequence": 1, "payload": { ... } }] }`
- Pull operations after a sequence:
  - `GET /api/applications/:applicationId/crdt-ops?afterSequence=10`

## Authentication + Roles
- Auth model: email OTP + JWT.
- Seed users are configured by `AUTH_SEED_USERS`:
  - default: `officer@alcomatcher.com:compliance_officer;manager@alcomatcher.com:compliance_manager`
- Request OTP:
  - `POST /api/auth/otp/request`
  - body: `{ "email": "officer@alcomatcher.com" }`
- Verify OTP:
  - `POST /api/auth/otp/verify`
  - body: `{ "email": "officer@alcomatcher.com", "code": "123456" }`
  - returns `{ token, user }` and sets `alcomatcher_token` httpOnly cookie.
- Current prototype behavior:
  - scanner quick-check remains anonymous-capable.
  - admin APIs (`/api/admin/*`, `/api/batches*`, `/admin/*`) require `compliance_manager`.
  - application data APIs require auth and are ownership-scoped for officers.
- In non-production mode, OTP response includes `debugCode` for local testing (`AUTH_DEBUG_OTP=true`).
- Apple review static OTP override (optional):
  - controlled by `APPLE_REVIEW_OTP_ENABLED`, `APPLE_REVIEW_EMAIL`, `APPLE_REVIEW_OTP`
  - when enabled, `reviewer@apple.com` can use stable OTP for App Review login
  - reviewer account is forced/upserted as `compliance_officer` (scanner access, no admin access)

## Batch and Admin APIs (Week-One Foundation)
- Batch ingestion (JSON items, or multipart with optional `archive` ZIP + `manifest` CSV):
  - `POST /api/batches`
- Batch status and item window:
  - `GET /api/batches/:batchId?limit=100&offset=0`
- Batch item drill-down (retry history + rich failure reasons):
  - `GET /api/batches/:batchId/items/:batchItemId`
- Batch job listing:
  - `GET /api/batches?limit=100`
- Admin queue projection:
  - `GET /api/admin/queue`
- Compliance report export:
  - `GET /api/applications/:applicationId/report`
- Admin sync-state backfill:
  - `POST /api/admin/backfill/sync-state`
- Admin KPI summary:
  - `GET /api/admin/kpis?windowHours=24`

## Realtime Events (SSE)
- Stream endpoint:
  - `GET /api/events/stream`
- Event types:
  - `sync.ack`
  - `application.status_changed`
  - `batch.progress`

## OpenClaw Ops Monitor + KPI Digests
- Tiered monitor script: `infra/openclaw/monitor-alerts.sh`
- KPI digest script: `infra/openclaw/send-kpi-digest.sh`
- Legacy wrapper script: `infra/openclaw/alert-scanner-failures.sh`
- Systemd units:
  - `infra/openclaw/alcomatcher-openclaw-monitor.service`
  - `infra/openclaw/alcomatcher-openclaw-digest.service`
  - `infra/openclaw/alcomatcher-openclaw-digest.timer`
  - legacy alias: `infra/openclaw/alcomatcher-openclaw-alerts.service`
- Example VM install:
  - `chmod +x /opt/alcomatcher/infra/openclaw/*.sh /opt/alcomatcher/infra/openclaw/lib/*.sh`
  - `cp /opt/alcomatcher/infra/openclaw/alcomatcher-openclaw-monitor.service /etc/systemd/system/`
  - `cp /opt/alcomatcher/infra/openclaw/alcomatcher-openclaw-digest.service /etc/systemd/system/`
  - `cp /opt/alcomatcher/infra/openclaw/alcomatcher-openclaw-digest.timer /etc/systemd/system/`
  - `cp /opt/alcomatcher/infra/openclaw/alcomatcher-openclaw-alerts.service /etc/systemd/system/`
  - `systemctl daemon-reload`
  - `systemctl enable --now alcomatcher-openclaw-monitor.service`
  - `systemctl enable --now alcomatcher-openclaw-digest.timer`
- Live drill:
  - `/bin/bash /opt/alcomatcher/infra/openclaw/monitor-alerts.sh --drill`

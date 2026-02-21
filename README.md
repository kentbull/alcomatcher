# AlcoMatcher

Scanner-first, offline-first compliance platform for alcohol label review.

## Monorepo Layout
- `apps/server`: Express API, event-sourced domain services, CQRS projections, batch worker
- `apps/web`: Ionic React + Capacitor scanner and admin web/mobile shell
- `infra/nginx`: Nginx configs for local/prod reverse proxy
- `plans`: release plan, ADRs, source references, and agent state
- `test-scripts/batch`: synthetic batch generation and smoke test helpers

## Prerequisites
- Node.js `>=20`
- npm `>=10`
- Docker + Docker Compose (for containerized server stack)

## Quick Start (Docker Stack)
1. Install dependencies:
   - `npm install`
2. Copy env file:
   - `cp .env.example .env`
3. Start services:
   - `docker compose up --build`
4. Verify:
   - `curl http://localhost:3000/health`

First-run note:
- Local Docker no longer requires sharing `/opt/keys/google-key.json`.
- Cloud OCR stays disabled unless you explicitly set `GOOGLE_APPLICATION_CREDENTIALS` and provide a key in the mounted keys directory.

This brings up:
- `app` (API/static web host) on `http://localhost:3000`
- `worker` (background batch processing)
- `db` (Postgres 16)
- `nginx` on `http://localhost:8080`

## Local Development (Without Docker for App Processes)
1. Install dependencies:
   - `npm install`
2. Start the API:
   - `npm run dev:server`
3. Start the worker (required for queued OTP/verification retries):
   - `npm run worker --workspace @alcomatcher/server`
4. Start the web app:
   - `npm run dev:web`

Local URLs:
- Scanner web app: `http://localhost:8100`
- Admin UI: `http://localhost:8100/admin`
- API health: `http://localhost:3000/health`

Note: local server development still needs a reachable Postgres instance via `DATABASE_URL`.
Note: email-based registration/OTP flows require both `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

## Environment Notes
Use `.env.example` as the baseline.

Commonly adjusted values:
- `DATABASE_URL`: Postgres connection string
- `CORS_ORIGIN`: web origin (default `http://localhost:8100`)
- `JWT_SECRET`: replace in non-dev environments
- `VITE_API_BASE_URL` (`apps/web`): set only when web and API are on different origins
- `GOOGLE_APPLICATION_CREDENTIALS`: optional Google Vision key path
- `ANTHROPIC_API_KEY`: optional Claude key for semantic extraction
- `SEMANTIC_EXTRACTION_ENABLED`: enable semantic extraction path when needed

## Build, Test, Typecheck
- Build all workspaces: `npm run build`
- Test all workspaces: `npm test`
- Typecheck all workspaces: `npm run typecheck`

Server-only tests:
- `npm run test --workspace @alcomatcher/server`

## Scanner and Batch Flow (Current)
- Single scan quick check: `POST /api/scanner/quick-check` (front/back + optional additional images)
- Session-based scan flow: `POST /api/scanner/sessions` and related image/session endpoints
- Batch upload flow (manager role): `POST /api/batches/upload`, poll with `GET /api/batches/:batchId`

## OCR / Decision Pipeline
- Local OCR baseline: server-side Tesseract
- Cloud OCR fallback: Google Vision (optional)
- Semantic extraction: Anthropic Claude (optional)

## Architecture
- Aggregate root: `ComplianceApplication`
- Local-first sync model with CRDT merge service
- Event sourcing for command-side state changes
- CQRS projections for query/read models
- Immutable event history for auditability

## Mobile Testing
- Fast path: open scanner in mobile browser and run a quick check
- iOS Capacitor path:
  1. `cd apps/web`
  2. `npm run cap:sync`
  3. `npm run cap:open:ios`
  4. Build/run from Xcode on device

## Additional Docs
- Admin UI details: `apps/web/ADMIN_README.md`
- Release plan: `plans/release-plan-v1.md`
- Decisions/ADRs: `plans/decisions.md`
- Source references: `plans/sources.md`

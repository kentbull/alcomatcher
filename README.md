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
- The Google Vision API is used for processing the images after they are uploaded to the server for additional OCR resilience.
- The Claude text API is used to process the text extracted from the images to perform brand, class, and other attribute matching.

## Architecture Notes
- `ComplianceApplication` is modeled as a local-first CRDT document synced to the server.
- Server state remains event-sourced and query projections are derived from immutable events.


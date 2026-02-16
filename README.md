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

## Architecture Notes
- `ComplianceApplication` is modeled as a local-first CRDT document synced to the server.
- Server state remains event-sourced and query projections are derived from immutable events.

# Redigo Logistics Wizard v1.2

SAP ↔ 3PL/WMS Integration Cockpit — SAPUI5 Fiori frontend + Node.js Express backend.

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# Run migrations
npm run migrate

# Seed sample data (optional)
npm run seed

# Start backend (port 3000)
npm run dev

# Start frontend (port 8090)
npx http-server webapp -p 8090 -c-1
```

Open http://localhost:8090 in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend with nodemon |
| `npm start` | Start backend (production) |
| `npm run migrate` | Run pending DB migrations |
| `npm run migrate:status` | Show migration status |
| `npm run migrate:rollback` | Rollback last migration |
| `npm run seed` | Seed sample data |
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format code with Prettier |
| `npm run build:ui` | Build SAPUI5 for production |

## Architecture

```
src/
  index.js              # Express app entry point
  api/routes/            # REST API endpoints
  shared/
    config/              # Environment configuration
    database/            # PostgreSQL pool, migrations, DbStore
    middleware/          # Auth, audit, rate limiting, error handler
    queue/               # pgQueue (PostgreSQL job queue)
    utils/               # Logger, metrics, circuit breaker
  modules/
    work-order/          # Work order domain services

webapp/                  # SAPUI5 Fiori frontend
  controller/            # View controllers + config mixins
  view/                  # XML views
  i18n/                  # Translations (en, tr, de, fr, es)
  util/                  # API client, utilities
```

## Tech Stack

- **Frontend**: SAPUI5 (CDN), Fiori design, SplitApp navigation
- **Backend**: Node.js, Express, PostgreSQL, BullMQ (optional Redis)
- **Auth**: JWT (local dev) / XSUAA (SAP BTP)
- **Deployment**: SAP BTP Cloud Foundry (mta.yaml)

## Environment Variables

See `.env.example` for the full list. Key variables:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — PostgreSQL
- `JWT_SECRET` — **Required in production**
- `PORT` — Backend port (default: 3000)
- `LOG_LEVEL` — Logging level (default: info)
- `SENTRY_DSN` — Error tracking (optional)

## Testing

```bash
npm test                 # All tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests (needs PostgreSQL)
```

Coverage threshold: 65% lines/statements, 60% branches/functions.

## License

Proprietary — Redigo Logistics

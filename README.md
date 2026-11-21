# LedgerFlow
Phase 0: tenant-isolated Postgres foundation (RLS, append-only double-entry journal, audit log, idempotency).

    docker compose up -d
    cp .env.example .env
    npm i pg
    node --env-file=.env scripts/migrate.mjs
    node --env-file=.env scripts/verify-foundation.mjs

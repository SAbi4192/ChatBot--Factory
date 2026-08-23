# ADR-001 — SQLite as the default database (Postgres-ready)

**Status:** Accepted · **Date:** Checkpoint 0

## Context
The project must demo on localhost with zero setup risk. A PostgreSQL server adds a moving
part that can fail mid-demo (service not running, credentials, port conflicts).

## Decision
Prisma ORM with **SQLite as the default provider** (`DATABASE_URL=file:../data/chatbot_factory.db`).
The schema is written provider-portably (no provider-specific types, `@map` for snake_case columns,
cascades via `onDelete: Cascade`). Switching to PostgreSQL = change `provider` to `postgresql`,
point `DATABASE_URL` at a server, and run `prisma migrate deploy`.

## Consequences
- Zero-config demo; the DB is a file that ships with the repo state.
- Migration history (`prisma/migrations/`) is committed, so upgrades are reproducible.
- SQLite has no enums and limited JSON filtering — handled via String columns + in-code constants,
  and JS-side filtering where needed (e.g. the moderation flagged list).

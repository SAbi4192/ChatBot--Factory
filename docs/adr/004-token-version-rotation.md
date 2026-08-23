# ADR-004 — Refresh-token rotation via token versioning

**Status:** Accepted · **Date:** Checkpoint 2

## Context
JWT refresh tokens need invalidation on logout and rotation on use. A refresh-token table adds
storage and cleanup complexity for a localhost project.

## Decision
Each user carries a `tokenVersion` int. Refresh tokens embed the version. On every refresh and
on logout, the version is incremented — which invalidates **all** previously issued refresh
tokens instantly. Access tokens stay short-lived (15 min) and are stateless.

## Consequences
- Rotation is automatic: reusing an old refresh token fails (401).
- Logout kills every session at once (a feature, not a bug).
- No refresh-token table, no cleanup jobs.

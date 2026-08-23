# ADR-002 — SSE streaming instead of WebSockets

**Status:** Accepted · **Date:** Checkpoint 4

## Context
Chat responses should stream token-by-token for perceived quality. Options: WebSockets
(socket.io) or Server-Sent Events.

## Decision
**SSE (`text/event-stream`) over a plain `POST /api/chat/stream` endpoint.**

## Consequences
- One-way server→client streaming is exactly what chat needs; no client→server channel required.
- Works over plain HTTP — no upgrade handshake, no extra dependency, survives proxies better.
- Implemented with `fetch` + `ReadableStream` on the client, with a graceful fallback to the
  non-streaming POST when SSE fails.
- The 5s-polling "real-time" analytics strip is also HTTP-based, so **no WebSocket server** is
  needed anywhere in the stack.

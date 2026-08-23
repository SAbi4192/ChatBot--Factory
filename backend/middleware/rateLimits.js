/**
 * Rate-limiting configuration.
 *
 * Two tiers:
 *   - apiLimiter: general API traffic (generous for a demo app)
 *   - aiLimiter:  AI endpoints (tighter — each call costs real provider tokens)
 *
 * Uses the in-memory store (default). Swap to a Redis store if the app ever
 * runs behind multiple processes.
 */
import rateLimit from 'express-rate-limit';

/** General API limiter — 300 requests per minute per IP. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

/** AI endpoint limiter — 60 requests per minute per IP. */
export const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'AI request limit reached — try again in a minute.' },
});

import { normaliseQuery } from './domainGuard.js';

/**
 * ============================================================
 * CURRENT-INFORMATION DETECTOR
 * ------------------------------------------------------------
 * Decides whether a question needs FRESH facts from the web, or can be
 * answered for free by the local model.
 *
 * Kept in its own module so it can be tested without loading the database
 * layer, and so the list of signals is easy to audit in one place.
 *
 * Matching is whole-word: "now" must not match "k(now)" and "change" must
 * not match "ex(change)", or ordinary questions would be pushed to the
 * paid web APIs. Input runs through normaliseQuery first, so a typo like
 * "lastest" is still recognised as "latest".
 * ============================================================
 */
export const CURRENT_SIGNALS = [
  'latest', 'newest', 'recent', 'recently', 'current', 'currently', 'today',
  'yesterday', 'this week', 'this month', 'this year', 'right now', 'nowadays',
  'upcoming', 'so far', 'just released', 'newly released', 'just announced',
  'recently announced', 'just launched', 'current price', 'current status',
  'live score', 'breaking', 'news', 'update', 'updated', 'out now', 'released yet',
  'in 2024', 'in 2025', 'in 2026', 'this generation', 'new generation'
];

export function isCurrentQuery(message) {
  const m = normaliseQuery(message);
  return CURRENT_SIGNALS.some(sig => {
    const safe = sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${safe}\\b`).test(m);
  });
}

export default isCurrentQuery;

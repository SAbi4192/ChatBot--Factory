/**
 * Bot service — business logic for bot CRUD and generation.
 *
 * Routes call these functions; this module owns the rules (caps, ID
 * generation, org scoping, quota checks) while db.js owns storage.
 */
import db from '../db.js';
import { generateSingleBot } from '../generator.js';
import { ApiError } from '../middleware/errorHandler.js';
import { checkBotQuota } from './org.service.js';

/** Server-side cap per generation request; the frontend batches larger orders. */
export const GENERATE_CAP = 50;

/** Short random ID, matching the format used by the procedural generator. */
export const uid = () => Math.random().toString(36).substring(2, 11);

/** List all bots, newest first, each with its conversation count. */
export async function listBots(orgId) {
  return db.getBots(orgId);
}

/** Fetch one bot by id; throws 404 ApiError when missing. */
export async function getBotOrThrow(id, orgId) {
  const bot = await db.getBot(id, orgId);
  if (!bot) throw new ApiError(404, 'Bot not found');
  return bot;
}

/**
 * Generate up to GENERATE_CAP bots in one request.
 * The org's bot quota is enforced before any generation work starts.
 * Returns { bots, count, capped } so the route can report truncation.
 */
export async function generateBots(requestedCount, orgId) {
  const n = Math.min(requestedCount, GENERATE_CAP);

  const quota = await checkBotQuota(orgId, n);
  if (!quota.ok) throw new ApiError(429, quota.message);

  const bots = await Promise.all(
    Array.from({ length: n }).map(() => generateSingleBot())
  );
  await db.insertBotsBulk(bots, orgId);
  return { bots, count: n, capped: requestedCount > GENERATE_CAP, quota: quota.usage };
}

/** Toggle a bot's favorite flag; returns the new state. */
export async function toggleFavorite(id, orgId) {
  await getBotOrThrow(id, orgId);
  await db.toggleFavorite(id, orgId);
  const bot = await db.getBot(id, orgId);
  return bot?.favorite ?? false;
}

/** Delete one bot and cascade to its conversations + messages. */
export async function deleteBot(id, orgId) {
  const deleted = await db.deleteBot(id, orgId);
  if (!deleted) throw new ApiError(404, 'Bot not found');
}

/** Delete every bot, conversation and message in the org. */
export async function deleteAllBots(orgId) {
  await db.deleteAll(orgId);
}

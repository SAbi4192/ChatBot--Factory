/**
 * Bot service — business logic for bot CRUD and generation.
 *
 * Routes call these functions; this module owns the rules (caps, ID
 * generation) while db.js owns storage. Keeping the logic here means the
 * upcoming Prisma swap only touches the data layer, not the HTTP layer.
 */
import db from '../db.js';
import { generateSingleBot } from '../generator.js';
import { ApiError } from '../middleware/errorHandler.js';

/** Server-side cap per generation request; the frontend batches larger orders. */
export const GENERATE_CAP = 50;

/** Short random ID, matching the format used by the procedural generator. */
export const uid = () => Math.random().toString(36).substring(2, 11);

/** List all bots, newest first, each with its conversation count. */
export async function listBots() {
  return db.getBots();
}

/** Fetch one bot by id; throws 404 ApiError when missing. */
export async function getBotOrThrow(id) {
  const bot = await db.getBot(id);
  if (!bot) throw new ApiError(404, 'Bot not found');
  return bot;
}

/**
 * Generate up to GENERATE_CAP bots in one request.
 * Returns { bots, count, capped } so the route can report truncation.
 */
export async function generateBots(requestedCount) {
  const n = Math.min(requestedCount, GENERATE_CAP);
  const bots = await Promise.all(
    Array.from({ length: n }).map(() => generateSingleBot())
  );
  await db.insertBotsBulk(bots);
  return { bots, count: n, capped: requestedCount > GENERATE_CAP };
}

/** Toggle a bot's favorite flag; returns the new state. */
export async function toggleFavorite(id) {
  await getBotOrThrow(id);
  await db.toggleFavorite(id);
  const bot = await db.getBot(id);
  return bot?.favorite ?? false;
}

/** Delete one bot and cascade to its conversations + messages. */
export async function deleteBot(id) {
  const deleted = await db.deleteBot(id);
  if (!deleted) throw new ApiError(404, 'Bot not found');
}

/** Delete every bot, conversation and message. */
export async function deleteAllBots() {
  await db.deleteAll();
}

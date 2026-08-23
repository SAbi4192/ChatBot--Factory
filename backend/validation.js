/**
 * Zod request validation — the single source of truth for what the API
 * accepts. Invalid payloads are rejected at the boundary with a 400 before
 * any handler logic runs.
 */
import { z } from 'zod';
import { ApiError } from './middleware.js';

const shortId = z.string().trim().min(1).max(64);
const title = z.string().trim().min(1).max(200);

export const schemas = {
  // Frontend batches large orders into requests of <= 50; the server still
  // caps per-request at 50, so anything above that is a client bug.
  generateBots: z.object({
    count: z.coerce.number().int().min(1).max(500),
  }),

  chat: z.object({
    botId: shortId,
    conversationId: shortId,
    message: z.string().trim().min(1).max(8000),
  }),

  regenerate: z.object({
    botId: shortId,
    conversationId: shortId,
  }),

  // POST /api/bots/:botId/conversations — everything optional, server fills in.
  createConversationUnderBot: z.object({
    id: shortId.optional(),
    title: title.optional(),
    createdAt: z.number().int().positive().optional(),
  }),

  // POST /api/conversations — legacy endpoint, id + botId required.
  createConversation: z.object({
    id: shortId,
    botId: shortId,
    title: title.optional(),
    createdAt: z.number().int().positive().optional(),
  }),

  renameConversation: z.object({
    title,
  }),
};

/** Express middleware factory: validate req.body against a Zod schema. */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const details = result.error.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ');
      return next(new ApiError(400, `Invalid request — ${details}`));
    }
    req.body = result.data; // handlers only ever see validated, coerced data
    next();
  };
}
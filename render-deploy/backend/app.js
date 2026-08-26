// IMPORTANT: load env first so llmService/domainGuard see the keys at import time.
import './loadEnv.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { apiLimiter } from './middleware/rateLimits.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/auth.js';

import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import orgRoutes from './routes/orgs.routes.js';
import botRoutes from './routes/bots.routes.js';
import builderRoutes from './routes/builder.routes.js';
import customBotRoutes from './routes/customBot.routes.js';
import templatesRoutes from './routes/templates.routes.js';
import handoffRoutes from './routes/handoff.routes.js';
import conversationRoutes from './routes/conversations.routes.js';
import intelligenceRoutes from './routes/intelligence.routes.js';
import searchRoutes from './routes/search.routes.js';
import shareRoutes from './routes/share.routes.js';
import ragRoutes from './routes/rag.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import moderationRoutes from './routes/moderation.routes.js';
import publicRoutes from './routes/public.routes.js';
import widgetRoutes from './routes/widget.routes.js';
import chatRoutes from './routes/chat.routes.js';

/** Build the Express app (no listen — importable for tests). */
export function createApp() {
  const app = express();

  // --- Security headers -------------------------------------------------------
  app.use(helmet({ contentSecurityPolicy: false }));

  // --- CORS allowlist -----------------------------------------------------------
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Dev-friendly: any localhost / 127.0.0.1 origin (any port) is always
  // allowed — covers Vite on :5173 and the widget test pages. The explicit
  // allowlist adds non-local origins (e.g. deployed widget hosts).
  const isLocal = (origin) =>
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');

  app.use(cors({
    origin(origin, callback) {
      if (!origin || isLocal(origin) || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
  }));

  // --- Body parsing + rate limiting ----------------------------------------------
  app.use('/api', apiLimiter);
  app.use(express.json({ limit: '4mb' }));

  // --- Public routes ---------------------------------------------------------------
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/share', shareRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/', widgetRoutes);

  // --- Text-to-speech proxy (public) ------------------------------------------------
  // Streams Google Translate TTS through our own backend so the browser never
  // hits cross-origin/blocking issues with translate.google.com. One chunk
  // (~180 chars) per request; the frontend queues chunks for long messages.
  // Rate-limited by the /api limiter above.
  app.get('/api/tts', async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 180);
    const tl = String(req.query.tl || 'en').slice(0, 10);
    if (!q) return res.status(400).json({ error: 'Missing q parameter' });
    try {
      const upstream = await fetch(
        `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&total=1&idx=0&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }
      );
      if (!upstream.ok) return res.status(502).json({ error: `TTS upstream failed (${upstream.status})` });
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (!buf.length) return res.status(502).json({ error: 'TTS upstream returned empty audio' });
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (e) {
      res.status(502).json({ error: `TTS upstream unreachable: ${e.message}` });
    }
  });

  // --- Protected API routes (JWT + org scoping) -------------------------------------
  app.use('/api/orgs', requireAuth, orgRoutes);
  app.use('/api/bots', requireAuth, botRoutes);
  app.use('/api/bots', requireAuth, builderRoutes);
  app.use('/api/bots/custom', requireAuth, customBotRoutes);
  app.use('/api/templates', requireAuth, templatesRoutes);
  app.use('/api/handoff', requireAuth, handoffRoutes);
  app.use('/api/conversations', requireAuth, conversationRoutes);
  app.use('/api/conversations', requireAuth, intelligenceRoutes);
  app.use('/api/search', requireAuth, searchRoutes);
  app.use('/api/bots', requireAuth, ragRoutes);
  app.use('/api/analytics', requireAuth, analyticsRoutes);
  app.use('/api/moderation', requireAuth, moderationRoutes);
  app.use('/api/chat', requireAuth, chatRoutes);

  // --- Static frontend (production) -------------------------------------------
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir));

  // --- SPA fallback (must stay after all API routes) ----------------------------
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });

  // --- Central error handler (must be LAST) --------------------------------------
  app.use(errorHandler);
  return app;
}

/** Start a server on the given port (returns the http.Server). */
export function createServer(port) {
  const app = createApp();
  return app.listen(port);
}

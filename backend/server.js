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
import { bootstrapIfNeeded } from './services/auth.service.js';

import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import orgRoutes from './routes/orgs.routes.js';
import botRoutes from './routes/bots.routes.js';
import customBotRoutes from './routes/customBot.routes.js';
import conversationRoutes from './routes/conversations.routes.js';
import intelligenceRoutes from './routes/intelligence.routes.js';
import searchRoutes from './routes/search.routes.js';
import shareRoutes from './routes/share.routes.js';
import ragRoutes from './routes/rag.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import chatRoutes from './routes/chat.routes.js';

const app = express();

// --- Security headers ---------------------------------------------------------
// CSP is disabled because the React SPA uses inline styles; the other helmet
// protections (X-Content-Type-Options, frame-ancestors, etc.) stay on.
app.use(helmet({ contentSecurityPolicy: false }));

// --- CORS allowlist -----------------------------------------------------------
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
}));

// --- Body parsing + rate limiting ----------------------------------------------
app.use('/api', apiLimiter);
app.use(express.json({ limit: '2mb' }));

// --- Public routes ---------------------------------------------------------------
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/share', shareRoutes);

// --- Protected API routes (JWT + org scoping) -------------------------------------
app.use('/api/orgs', requireAuth, orgRoutes);
app.use('/api/bots', requireAuth, botRoutes);
app.use('/api/bots/custom', requireAuth, customBotRoutes);
app.use('/api/conversations', requireAuth, conversationRoutes);
app.use('/api/conversations', requireAuth, intelligenceRoutes);
app.use('/api/search', requireAuth, searchRoutes);
app.use('/api/bots', requireAuth, ragRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);
app.use('/api/chat', requireAuth, chatRoutes);

// --- Static frontend (production) -------------------------------------------
// Serves the Vite build output so one service hosts the whole app.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));

const PORT = process.env.PORT || 3001;

// First-run bootstrap (legacy bots -> admin account) before serving traffic.
bootstrapIfNeeded()
  .catch((err) => console.error('[bootstrap] failed:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`\n🏭  Universal Chatbot Factory backend running on http://localhost:${PORT}`);
      console.log(`    AI mode: ${process.env.AI_PROVIDER || 'auto'}`);
    });
  });

// --- SPA fallback (must stay after all API routes) ----------------------------
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(distDir, 'index.html'));
});

// --- Central error handler (must be LAST) --------------------------------------
app.use(errorHandler);

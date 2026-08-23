// IMPORTANT: load env first so llmService/domainGuard see the keys at import time.
import './loadEnv.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { apiLimiter } from './middleware/rateLimits.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.routes.js';
import botRoutes from './routes/bots.routes.js';
import conversationRoutes from './routes/conversations.routes.js';
import chatRoutes from './routes/chat.routes.js';

const app = express();

// --- Security headers ---------------------------------------------------------
// CSP is disabled because the React SPA uses inline styles; the other helmet
// protections (X-Content-Type-Options, frame-ancestors, etc.) stay on.
app.use(helmet({ contentSecurityPolicy: false }));

// --- CORS allowlist -----------------------------------------------------------
// Same-origin requests (Vite dev proxy, production static serving) carry no
// Origin header and are always allowed. Cross-origin requests must come from
// an origin listed in CORS_ORIGINS (comma-separated).
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

// --- API routes -----------------------------------------------------------------
app.use('/api/health', healthRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/chat', chatRoutes);

// --- Static frontend (production) -------------------------------------------
// Serves the Vite build output so one service hosts the whole app.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🏭  Universal Chatbot Factory backend running on http://localhost:${PORT}`);
  console.log(`    AI mode: ${process.env.AI_PROVIDER || 'auto'}`);
});

// --- SPA fallback (must stay after all API routes) ----------------------------
// Client-side routes (e.g. /chat/<id>) resolve to index.html; unknown API
// paths still get a JSON 404 instead of HTML.
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(distDir, 'index.html'));
});

// --- Central error handler (must be LAST) --------------------------------------
// Catches CORS rejections, malformed JSON, ApiErrors, and anything else, and
// answers with a consistent JSON shape without leaking internals.
app.use(errorHandler);

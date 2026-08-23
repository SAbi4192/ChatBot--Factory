// IMPORTANT: load env first so llmService/domainGuard see the keys at import time.
import './loadEnv.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import db from './db.js';
import { generateSingleBot } from './generator.js';
import { generateChatResponse, regenerateChatResponse, getProviderStatus } from './llmService.js';
import { errorHandler, ApiError } from './middleware.js';
import { validate, schemas } from './validation.js';

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

// --- Rate limiting -------------------------------------------------------------
// Generous defaults for a demo app; the AI endpoints get a tighter limit since
// each call costs real provider tokens.
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'AI request limit reached — try again in a minute.' },
});

app.use('/api', apiLimiter);
app.use(express.json({ limit: '2mb' }));

// --- Health / status -------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    const status = await getProviderStatus();
    res.json({ ok: true, ...status });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// --- Bots ------------------------------------------------------------------
app.get('/api/bots', (req, res) => {
  try {
    res.json(db.getBots());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bots/:botId', (req, res) => {
  try {
    const bot = db.getBot(req.params.botId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    res.json(bot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/bots', (req, res) => {
  try {
    db.deleteAll();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a single bot with cascade (its conversations and messages go too).
app.delete('/api/bots/:botId', (req, res) => {
  try {
    const deleted = db.deleteBot(req.params.botId);
    if (!deleted) return res.status(404).json({ error: 'Bot not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bots/generate', aiLimiter, validate(schemas.generateBots), async (req, res) => {
  try {
    const count = req.body.count;
    const cap = 50; // Cap to 50 for LLM generation
    const n = Math.min(count, cap);

    // Batch generate bots using Promise.all
    const newBots = await Promise.all(
      Array.from({ length: n }).map(() => generateSingleBot())
    );
    
    db.insertBotsBulk(newBots);

    res.json({ success: true, count: n, capped: count > cap, sample: newBots[0] });
  } catch (error) {
    console.error('Generate bots error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bots/:botId/favorite', (req, res) => {
  try {
    db.toggleFavorite(req.params.botId);
    const bot = db.getBot(req.params.botId);
    res.json({ success: true, favorite: bot?.favorite ?? false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Conversations ---------------------------------------------------------
app.get('/api/bots/:botId/conversations', (req, res) => {
  try {
    res.json(db.getConversations(req.params.botId));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Preferred REST style: create a conversation under a bot.
app.post('/api/bots/:botId/conversations', validate(schemas.createConversationUnderBot), (req, res) => {
  try {
    const id = req.body.id || Math.random().toString(36).substring(2, 11);
    const title = req.body.title || 'New Conversation';
    const createdAt = req.body.createdAt || Date.now();
    db.createConversation(id, req.params.botId, title, createdAt);
    res.json({ id, botId: req.params.botId, title, createdAt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Backwards-compatible endpoint (frontend currently posts here).
app.post('/api/conversations', validate(schemas.createConversation), (req, res) => {
  try {
    const { id, botId, title, createdAt } = req.body;
    db.createConversation(id, botId, title || 'New Conversation', createdAt || Date.now());
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/conversations/:convId', validate(schemas.renameConversation), (req, res) => {
  try {
    db.renameConversation(req.params.convId, req.body.title);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/conversations/:convId', (req, res) => {
  try {
    db.deleteConversation(req.params.convId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/conversations/:convId/messages', (req, res) => {
  try {
    res.json(db.getMessages(req.params.convId));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Chat ------------------------------------------------------------------
app.post('/api/chat', aiLimiter, validate(schemas.chat), async (req, res) => {
  try {
    const { botId, conversationId, message } = req.body;
    const response = await generateChatResponse(botId, conversationId, message);
    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/regenerate', aiLimiter, validate(schemas.regenerate), async (req, res) => {
  try {
    const { botId, conversationId } = req.body;
    const response = await regenerateChatResponse(botId, conversationId);
    res.json(response);
  } catch (error) {
    console.error('Regenerate error:', error);
    res.status(500).json({ error: error.message });
  }
});

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

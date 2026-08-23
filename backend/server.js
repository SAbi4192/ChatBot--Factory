// IMPORTANT: load env first so llmService/domainGuard see the keys at import time.
import './loadEnv.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import db from './db.js';
import { generateSingleBot } from './generator.js';
import { generateChatResponse, regenerateChatResponse, getProviderStatus } from './llmService.js';

const app = express();
app.use(cors());
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

app.post('/api/bots/generate', async (req, res) => {
  try {
    const count = Number(req.body?.count);
    if (!count || count < 1) return res.status(400).json({ error: 'Invalid count' });
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
app.post('/api/bots/:botId/conversations', (req, res) => {
  try {
    const id = req.body?.id || Math.random().toString(36).substring(2, 11);
    const title = req.body?.title || 'New Conversation';
    const createdAt = req.body?.createdAt || Date.now();
    db.createConversation(id, req.params.botId, title, createdAt);
    res.json({ id, botId: req.params.botId, title, createdAt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Backwards-compatible endpoint (frontend currently posts here).
app.post('/api/conversations', (req, res) => {
  try {
    const { id, botId, title, createdAt } = req.body;
    if (!id || !botId) return res.status(400).json({ error: 'Missing id or botId' });
    db.createConversation(id, botId, title || 'New Conversation', createdAt || Date.now());
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/conversations/:convId', (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Missing title' });
    db.renameConversation(req.params.convId, title);
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
app.post('/api/chat', async (req, res) => {
  try {
    const { botId, conversationId, message } = req.body;
    if (!botId || !conversationId || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const response = await generateChatResponse(botId, conversationId, message);
    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/regenerate', async (req, res) => {
  try {
    const { botId, conversationId } = req.body;
    if (!botId || !conversationId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
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

/**
 * RAG knowledge-base routes (Checkpoint 5) — upload, crawl, list, delete, stats.
 */
import { Router } from 'express';
import multer from 'multer';
import * as ragService from '../services/rag.service.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: ragService.UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

const router = Router();

// Upload a document (PDF/DOCX/TXT/CSV/JSON/MD).
router.post('/:botId/kb/documents', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const doc = await ragService.addDocument(req.params.botId, req.file);
    res.json(doc);
  } catch (e) { next(e); }
});

// Crawl a URL into the KB.
router.post('/:botId/kb/crawl', async (req, res, next) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'Invalid URL' });
    const doc = await ragService.crawlUrl(req.params.botId, url);
    res.json(doc);
  } catch (e) { next(e); }
});

// List documents with statuses.
router.get('/:botId/kb/documents', async (req, res, next) => {
  try { res.json(await ragService.listDocuments(req.params.botId)); } catch (e) { next(e); }
});

// KB stats (chunk counts, chars).
router.get('/:botId/kb/stats', async (req, res, next) => {
  try { res.json(await ragService.kbStats(req.params.botId)); } catch (e) { next(e); }
});

// Delete a document + its chunks.
router.delete('/:botId/kb/documents/:docId', async (req, res, next) => {
  try {
    await ragService.deleteDocument(req.params.botId, req.params.docId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Long-term memory: what does this bot remember about a question?
router.get('/:botId/memory', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    res.json(q ? await ragService.recallMemory(req.params.botId, q) : []);
  } catch (e) { next(e); }
});

export default router;
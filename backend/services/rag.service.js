/**
 * RAG knowledge base service (Checkpoint 5).
 *
 * Pipeline: extract text (pdf-parse / mammoth / raw) → recursive chunking
 * (500 chars, 50 overlap) → store chunks in SQLite (KnowledgeChunk) →
 * retrieval by keyword scoring (SQLite-friendly "vector store" — no external
 * service needed; switchable to real embeddings later).
 *
 * At query time the top-5 chunks are injected into the LLM context and the
 * matching document names are returned as chat "Sources".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { prisma } from '../prisma.js';
import { ApiError } from '../middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const uid = () => Math.random().toString(36).substring(2, 11);

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const TOP_K = 5;

// --- Text extraction ---------------------------------------------------------

async function extractText(filePath, originalName, mime) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.pdf' || mime === 'application/pdf') {
    const buf = fs.readFileSync(filePath);
    const parsed = await PDFParse.fromBuffer(buf, { verbosity: 0 });
    return (parsed?.text || parsed?.pageItems?.map((p) => p.text).join('\n') || '');
  }
  if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return value || '';
  }
  if (ext === '.csv' || ext === '.json' || ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf-8');
  }
  throw new ApiError(400, `Unsupported file type: ${ext || mime}`);
}

// --- Chunking ----------------------------------------------------------------

function chunkText(text) {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) return [];
  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + CHUNK_SIZE, cleaned.length);
    if (end < cleaned.length) {
      const newline = cleaned.lastIndexOf('\n', end);
      if (newline > start + CHUNK_SIZE / 2) end = newline;
    }
    const piece = cleaned.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= cleaned.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks;
}

// --- Retrieval (keyword scoring over chunks) ----------------------------------

const STOPWORDS = new Set('a an and are as at be by for from has he her his i in is it its of on or she that the their they this to was were will with you your'.split(' '));

function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
}

function significantTerms(text) {
  const counts = new Map();
  for (const t of tokenize(text)) {
    if (STOPWORDS.has(t)) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
}

/**
 * Score chunks for a question using term overlap (a deterministic, offline
 * approximation of cosine similarity over a vector store).
 */
function scoreChunks(chunks, terms) {
  return chunks
    .map((c) => {
      const body = `${c.content} ${c.metadata?.keywords ?? ''}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (body.includes(t)) score += t.length; // rarer/longer terms weigh more
      }
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}

/** Retrieve the top-K relevant chunks for a question from a bot's KB. */
export async function retrieveChunks(botId, question) {
  const kbs = await prisma.knowledgeBase.findMany({ where: { botId } });
  if (!kbs.length) return [];
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { kbId: { in: kbs.map((k) => k.id) } },
    include: { doc: { select: { id: true, name: true } } },
    take: 500,
  });
  const terms = significantTerms(question);
  if (!terms.length) return [];
  return scoreChunks(chunks, terms).map((c) => ({
    content: c.content,
    source: c.doc?.name ?? 'knowledge base',
    chunkId: c.id,
  }));
}

// --- Document lifecycle ------------------------------------------------------

/** Save an uploaded file as a KB document (synchronous pipeline for the demo). */
export async function addDocument(botId, { originalname, mimetype, path: filePath, size }) {
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) throw new ApiError(404, 'Bot not found');

  const kb = await prisma.knowledgeBase.upsert({
    where: { id: `${botId}-kb` },
    create: { id: `${botId}-kb`, botId, name: `${bot.name} KB`, type: 'upload' },
    update: {},
  });

  const doc = await prisma.knowledgeDocument.create({
    data: { id: uid(), kbId: kb.id, name: originalname, status: 'processing', chunkCount: 0 },
  });

  try {
    const text = await extractText(filePath, originalname, mimetype);
    const chunks = chunkText(text);
    await prisma.$transaction(
      chunks.map((content) =>
        prisma.knowledgeChunk.create({
          data: { id: uid(), kbId: kb.id, docId: doc.id, content },
        })
      )
    );
    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { status: chunks.length ? 'ready' : 'failed', chunkCount: chunks.length },
    });
    return { id: doc.id, name: originalname, status: chunks.length ? 'ready' : 'failed', chunkCount: chunks.length, size };
  } catch (e) {
    await prisma.knowledgeDocument.update({ where: { id: doc.id }, data: { status: 'failed' } });
    throw e;
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}

/** Crawl a URL: fetch, strip HTML, chunk, index (same pipeline as uploads). */
export async function crawlUrl(botId, url) {
  let resp;
  try {
    resp = await fetch(url, { headers: { 'User-Agent': 'Chatbot-Factory/1.0' }, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ApiError(400, 'Could not fetch that URL');
  }
  if (!resp.ok) throw new ApiError(400, `URL returned HTTP ${resp.status}`);
  const html = await resp.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  const kb = await prisma.knowledgeBase.upsert({
    where: { id: `${botId}-kb` },
    create: { id: `${botId}-kb`, botId, name: `${(await prisma.bot.findUnique({ where: { id: botId } }))?.name} KB`, type: 'upload' },
    update: {},
  });
  const doc = await prisma.knowledgeDocument.create({
    data: { id: uid(), kbId: kb.id, name: url, status: 'processing', chunkCount: 0 },
  });
  const chunks = chunkText(text);
  await prisma.$transaction(
    chunks.map((content) =>
      prisma.knowledgeChunk.create({
        data: { id: uid(), kbId: kb.id, docId: doc.id, content, metadata: { source: url } },
      })
    )
  );
  await prisma.knowledgeDocument.update({
    where: { id: doc.id },
    data: { status: chunks.length ? 'ready' : 'failed', chunkCount: chunks.length },
  });
  return { id: doc.id, name: url, status: chunks.length ? 'ready' : 'failed', chunkCount: chunks.length };
}

export async function listDocuments(botId) {
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: `${botId}-kb` } });
  if (!kb) return [];
  const docs = await prisma.knowledgeDocument.findMany({
    where: { kbId: kb.id },
    orderBy: { createdAt: 'desc' },
  });
  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    status: d.status,
    chunkCount: d.chunkCount,
    createdAt: d.createdAt.getTime(),
  }));
}

export async function deleteDocument(botId, docId) {
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: `${botId}-kb` } });
  if (!kb) throw new ApiError(404, 'No knowledge base for this bot');
  const doc = await prisma.knowledgeDocument.findFirst({ where: { id: docId, kbId: kb.id } });
  if (!doc) throw new ApiError(404, 'Document not found');
  await prisma.$transaction([
    prisma.knowledgeChunk.deleteMany({ where: { docId } }),
    prisma.knowledgeDocument.delete({ where: { id: docId } }),
  ]);
}

/** Summary for the KB panel (chunk counts, total chars). */
export async function kbStats(botId) {
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: `${botId}-kb` } });
  if (!kb) return { documents: 0, chunks: 0, chars: 0 };
  const chunks = await prisma.knowledgeChunk.findMany({ where: { kbId: kb.id }, select: { content: true } });
  return {
    documents: await prisma.knowledgeDocument.count({ where: { kbId: kb.id } }),
    chunks: chunks.length,
    chars: chunks.reduce((a, c) => a + c.content.length, 0),
  };
}

// --- Long-term memory (cross-conversation recall) -----------------------------

/**
 * Recall past exchanges with this bot that mention the current question's
 * terms — the bot "remembers" earlier sessions (keyword-based memory).
 */
export async function recallMemory(botId, question, limit = 3) {
  const terms = significantTerms(question);
  if (!terms.length) return [];
  const convs = await prisma.conversation.findMany({
    where: { botId },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } },
    take: 20,
  });
  const hits = [];
  for (const c of convs) {
    for (const m of c.messages) {
      const text = m.content.toLowerCase();
      const matched = terms.filter((t) => text.includes(t)).length;
      if (matched >= 1) {
        hits.push({ conversationId: c.id, role: m.role, content: m.content, score: matched });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

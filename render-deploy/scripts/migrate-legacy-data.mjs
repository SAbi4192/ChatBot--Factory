/**
 * One-time migration: legacy better-sqlite3 DB -> Prisma.
 *
 * Reads data/legacy_chatbot_factory.db (the pre-Prisma database, renamed by
 * Step 0.4) and writes every bot / conversation / message into the Prisma
 * database (data/chatbot_factory.db). On success the legacy file is moved to
 * data/backups/ so the script can never run twice by accident.
 *
 * Usage: node scripts/migrate-legacy-data.mjs
 *
 * Reconciliation report: prints row counts (legacy vs Prisma) per table and
 * exits non-zero if any table does not match.
 */
import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../backend/loadEnv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const LEGACY_PATH = path.join(DATA_DIR, 'legacy_chatbot_factory.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const CHUNK = 50;

if (!fs.existsSync(LEGACY_PATH)) {
  console.error('❌ Legacy DB not found (data/legacy_chatbot_factory.db).');
  console.error('   Nothing to migrate — the data was either already migrated or never existed.');
  process.exit(1);
}

const prisma = new PrismaClient();
const legacy = new Database(LEGACY_PATH);

const parseJson = (raw, fallback) => {
  if (raw == null) return fallback ?? null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return fallback ?? null; }
};

const toDate = (ms) => (ms ? new Date(ms) : new Date(0));

const readLegacyCounts = () => ({
  bots: legacy.prepare('SELECT COUNT(*) AS n FROM bots').get().n,
  conversations: legacy.prepare('SELECT COUNT(*) AS n FROM conversations').get().n,
  messages: legacy.prepare('SELECT COUNT(*) AS n FROM messages').get().n,
});

const mapBot = (b) => ({
  id: b.id,
  name: b.name,
  domain: b.domain,
  subdomain: b.subdomain,
  description: b.description,
  personality: b.personality,
  systemPrompt: b.system_prompt,
  theme: b.theme,
  designDna: parseJson(b.design_dna),
  avatar: b.avatar,
  welcomeMessage: b.welcome_message,
  starterQuestions: parseJson(b.starter_questions, []),
  domainProfile: parseJson(b.domain_profile),
  favorite: b.favorite === 1,
  createdAt: toDate(b.created_at),
  updatedAt: toDate(b.updated_at),
});

const mapConversation = (c) => ({
  id: c.id,
  botId: c.bot_id,
  title: c.title,
  createdAt: toDate(c.created_at),
  updatedAt: toDate(c.updated_at),
});

const mapMessage = (m) => ({
  id: m.id,
  conversationId: m.conversation_id,
  role: m.role,
  content: m.content,
  provider: m.provider ?? 'local',
  sources: parseJson(m.sources),
  createdAt: toDate(m.created_at),
});

const createChunked = async (rows, mapper, table) => {
  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    chunks.push(rows.slice(i, i + CHUNK));
  }
  for (const chunk of chunks) {
    const ops = chunk.map((row) =>
      table === 'bot' ? prisma.bot.create({ data: mapper(row) })
      : table === 'conversation' ? prisma.conversation.create({ data: mapper(row) })
      : prisma.message.create({ data: mapper(row) })
    );
    await prisma.$transaction(ops);
    process.stdout.write(`\r  ${table}s: ${Math.min(rows.indexOf(chunk[chunk.length - 1]) + 1, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');
};

const main = async () => {
  console.log('\n🔀 Legacy → Prisma migration');
  console.log('----------------------------------------');

  const legacyCounts = readLegacyCounts();
  console.log(`Legacy rows found: ${legacyCounts.bots} bots, ${legacyCounts.conversations} conversations, ${legacyCounts.messages} messages`);

  const existingBots = await prisma.bot.count();
  if (existingBots > 0) {
    console.error(`❌ Refusing to run: Prisma DB already has ${existingBots} bots.`);
    process.exit(1);
  }

  console.log('\nMigrating bots...');
  const bots = legacy.prepare('SELECT * FROM bots ORDER BY created_at').all();
  await createChunked(bots, mapBot, 'bot');

  console.log('Migrating conversations...');
  const conversations = legacy.prepare('SELECT * FROM conversations ORDER BY created_at').all();
  await createChunked(conversations, mapConversation, 'conversation');

  console.log('Migrating messages...');
  const messages = legacy.prepare('SELECT * FROM messages ORDER BY created_at').all();
  await createChunked(messages, mapMessage, 'message');

  // --- Reconciliation report -------------------------------------------------
  const newCounts = {
    bots: await prisma.bot.count(),
    conversations: await prisma.conversation.count(),
    messages: await prisma.message.count(),
  };

  console.log('\n📋 Reconciliation report');
  console.log('----------------------------------------');
  const tables = ['bots', 'conversations', 'messages'];
  let allMatch = true;
  for (const t of tables) {
    const ok = legacyCounts[t] === newCounts[t];
    allMatch = allMatch && ok;
    console.log(`  ${t.padEnd(14)} legacy=${String(legacyCounts[t]).padStart(6)}  prisma=${String(newCounts[t]).padStart(6)}  ${ok ? '✅ MATCH' : '❌ MISMATCH'}`);
  }

  if (!allMatch) {
    console.error('\n❌ Reconciliation failed — the Prisma DB was NOT finalized.');
    console.error('   The legacy file is still at data/legacy_chatbot_factory.db for recovery.');
    await prisma.$disconnect();
    process.exit(1);
  }

  // --- Success: archive the legacy file so the script can't run twice ---------
  legacy.close(); // release the file lock before renaming
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const suffix of ['', '-wal', '-shm']) {
    const src = `${LEGACY_PATH}${suffix}`;
    if (fs.existsSync(src)) {
      fs.renameSync(src, path.join(BACKUP_DIR, `legacy-chatbot-factory-${stamp}.db${suffix}`));
    }
  }

  console.log('\n✅ Migration complete. Legacy DB archived to data/backups/.');
  await prisma.$disconnect();
};

main().catch(async (err) => {
  console.error('\n❌ Migration failed:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});

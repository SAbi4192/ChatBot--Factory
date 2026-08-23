import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'chatbot_factory.db');
export const db = new Database(dbPath);

// Initialize DB schema
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    subdomain TEXT NOT NULL,
    description TEXT,
    personality TEXT,
    system_prompt TEXT,
    theme TEXT,
    design_dna TEXT,
    avatar TEXT,
    welcome_message TEXT,
    starter_questions TEXT,
    domain_profile TEXT,
    favorite INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    title TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY(bot_id) REFERENCES bots(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    provider TEXT DEFAULT 'local',
    sources TEXT,
    created_at INTEGER,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
  );
`);

// Safely add columns if migrating from V3
try { db.exec("ALTER TABLE bots ADD COLUMN starter_questions TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE bots ADD COLUMN domain_profile TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE messages ADD COLUMN provider TEXT DEFAULT 'local';"); } catch(e) {}
try { db.exec("ALTER TABLE messages ADD COLUMN sources TEXT;"); } catch(e) {}

// Prepared statements for Bots
const insertBotStmt = db.prepare(`
  INSERT INTO bots (id, name, domain, subdomain, description, personality, system_prompt, theme, design_dna, avatar, welcome_message, starter_questions, domain_profile, favorite, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getBotsStmt = db.prepare(`
  SELECT b.*, (SELECT COUNT(*) FROM conversations c WHERE c.bot_id = b.id) as conversationCount 
  FROM bots b ORDER BY b.created_at DESC
`);
const getBotStmt = db.prepare('SELECT * FROM bots WHERE id = ?');
const toggleFavoriteStmt = db.prepare('UPDATE bots SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?');

// Prepared statements for Conversations
const insertConvStmt = db.prepare(`
  INSERT INTO conversations (id, bot_id, title, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);
const getConvsStmt = db.prepare('SELECT * FROM conversations WHERE bot_id = ? ORDER BY updated_at DESC');
const updateConvTimeStmt = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?');
const deleteConvStmt = db.prepare('DELETE FROM conversations WHERE id = ?');
const renameConvStmt = db.prepare('UPDATE conversations SET title = ? WHERE id = ?');

// Prepared statements for Messages
const insertMsgStmt = db.prepare(`
  INSERT INTO messages (id, conversation_id, role, content, provider, sources, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const getMsgsStmt = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
const deleteMsgStmt = db.prepare('DELETE FROM messages WHERE id = ?');

function mapBotToFrontend(b) {
  return {
    id: b.id,
    name: b.name,
    domain: b.domain,
    subdomain: b.subdomain,
    description: b.description,
    personality: b.personality,
    systemPrompt: b.system_prompt,
    designDna: typeof b.design_dna === 'string' ? JSON.parse(b.design_dna) : b.design_dna,
    avatar: b.avatar,
    welcomeMessage: b.welcome_message,
    starterQuestions: b.starter_questions ? JSON.parse(b.starter_questions) : [],
    domainProfile: b.domain_profile ? JSON.parse(b.domain_profile) : null,
    favorite: b.favorite === 1,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    conversationCount: b.conversationCount || 0
  };
}

export default {
  // Bots
  getBots: () => {
    const bots = getBotsStmt.all();
    return bots.map(mapBotToFrontend);
  },
  getBot: (id) => {
    const b = getBotStmt.get(id);
    if (!b) return null;
    return mapBotToFrontend(b);
  },
  insertBotsBulk: (bots) => {
    const insertMany = db.transaction((botsArr) => {
      for (const b of botsArr) {
        insertBotStmt.run(
          b.id, b.name, b.domain, b.subdomain, b.description, b.personality, b.systemPrompt,
          b.designDna.theme, JSON.stringify(b.designDna), b.avatar, b.welcomeMessage,
          JSON.stringify(b.starterQuestions), JSON.stringify(b.domainProfile), 0,
          b.createdAt, b.createdAt
        );
      }
    });
    insertMany(bots);
  },
  toggleFavorite: (id) => toggleFavoriteStmt.run(id),
  deleteAll: () => {
    db.transaction(() => {
      db.exec('DELETE FROM messages');
      db.exec('DELETE FROM conversations');
      db.exec('DELETE FROM bots');
    })();
  },

  // Conversations
  createConversation: (id, botId, title, createdAt) => insertConvStmt.run(id, botId, title, createdAt, createdAt),
  getConversations: (botId) => getConvsStmt.all(botId),
  deleteConversation: (id) => deleteConvStmt.run(id),
  renameConversation: (id, title) => renameConvStmt.run(title, id),
  
  // Messages
  addMessage: (id, convId, role, content, createdAt, provider = 'local', sources = null) => {
    const transaction = db.transaction(() => {
      insertMsgStmt.run(id, convId, role, content, provider, sources ? JSON.stringify(sources) : null, createdAt);
      updateConvTimeStmt.run(createdAt, convId);
    });
    transaction();
  },
  getMessages: (convId) => {
    const msgs = getMsgsStmt.all(convId);
    return msgs.map(m => ({
      ...m,
      sources: m.sources ? JSON.parse(m.sources) : null
    }));
  },
  deleteMessage: (id) => deleteMsgStmt.run(id)
};

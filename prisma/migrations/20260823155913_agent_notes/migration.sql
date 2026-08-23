-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_agent_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "agent_user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "notes" JSONB,
    "created_at" DATETIME NOT NULL,
    "closed_at" DATETIME,
    CONSTRAINT "agent_sessions_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_sessions_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_agent_sessions" ("agent_user_id", "bot_id", "closed_at", "conversation_id", "created_at", "id", "status") SELECT "agent_user_id", "bot_id", "closed_at", "conversation_id", "created_at", "id", "status" FROM "agent_sessions";
DROP TABLE "agent_sessions";
ALTER TABLE "new_agent_sessions" RENAME TO "agent_sessions";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

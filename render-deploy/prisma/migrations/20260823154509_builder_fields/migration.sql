-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_bots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "description" TEXT,
    "personality" TEXT,
    "system_prompt" TEXT,
    "theme" TEXT,
    "design_dna" JSONB,
    "avatar" TEXT,
    "welcome_message" TEXT,
    "starter_questions" JSONB,
    "domain_profile" JSONB,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "creation_method" TEXT NOT NULL DEFAULT 'factory',
    "org_id" TEXT,
    "personality_traits" JSONB,
    "guard_strictness" TEXT NOT NULL DEFAULT 'moderate',
    "memory_enabled" BOOLEAN NOT NULL DEFAULT true,
    "provider" TEXT,
    "flow" JSONB,
    "slots" JSONB,
    CONSTRAINT "bots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_bots" ("avatar", "created_at", "creation_method", "description", "design_dna", "domain", "domain_profile", "favorite", "id", "name", "org_id", "personality", "starter_questions", "subdomain", "system_prompt", "theme", "updated_at", "welcome_message") SELECT "avatar", "created_at", "creation_method", "description", "design_dna", "domain", "domain_profile", "favorite", "id", "name", "org_id", "personality", "starter_questions", "subdomain", "system_prompt", "theme", "updated_at", "welcome_message" FROM "bots";
DROP TABLE "bots";
ALTER TABLE "new_bots" RENAME TO "bots";
CREATE TABLE "new_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "slot_state" JSONB,
    CONSTRAINT "conversations_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_conversations" ("bot_id", "created_at", "id", "title", "updated_at") SELECT "bot_id", "created_at", "id", "title", "updated_at" FROM "conversations";
DROP TABLE "conversations";
ALTER TABLE "new_conversations" RENAME TO "conversations";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_agent_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "agent_user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" DATETIME,
    CONSTRAINT "agent_sessions_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_sessions_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_agent_sessions" ("agent_user_id", "bot_id", "closed_at", "conversation_id", "created_at", "id", "status") SELECT "agent_user_id", "bot_id", "closed_at", "conversation_id", "created_at", "id", "status" FROM "agent_sessions";
DROP TABLE "agent_sessions";
ALTER TABLE "new_agent_sessions" RENAME TO "agent_sessions";
CREATE TABLE "new_analytics_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT,
    "org_id" TEXT,
    "event_type" TEXT NOT NULL,
    "data" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analytics_events_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_analytics_events" ("bot_id", "created_at", "data", "event_type", "id", "org_id") SELECT "bot_id", "created_at", "data", "event_type", "id", "org_id" FROM "analytics_events";
DROP TABLE "analytics_events";
ALTER TABLE "new_analytics_events" RENAME TO "analytics_events";
CREATE TABLE "new_bot_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config_snapshot" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bot_versions_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_bot_versions" ("bot_id", "config_snapshot", "created_at", "id", "version") SELECT "bot_id", "config_snapshot", "created_at", "id", "version" FROM "bot_versions";
DROP TABLE "bot_versions";
ALTER TABLE "new_bot_versions" RENAME TO "bot_versions";
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
    CONSTRAINT "bots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_bots" ("avatar", "created_at", "creation_method", "description", "design_dna", "domain", "domain_profile", "favorite", "id", "name", "org_id", "personality", "starter_questions", "subdomain", "system_prompt", "theme", "updated_at", "welcome_message") SELECT "avatar", "created_at", "creation_method", "description", "design_dna", "domain", "domain_profile", "favorite", "id", "name", "org_id", "personality", "starter_questions", "subdomain", "system_prompt", "theme", "updated_at", "welcome_message" FROM "bots";
DROP TABLE "bots";
ALTER TABLE "new_bots" RENAME TO "bots";
CREATE TABLE "new_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "conversations_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_conversations" ("bot_id", "created_at", "id", "title", "updated_at") SELECT "bot_id", "created_at", "id", "title", "updated_at" FROM "conversations";
DROP TABLE "conversations";
ALTER TABLE "new_conversations" RENAME TO "conversations";
CREATE TABLE "new_embeddable_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "org_id" TEXT,
    "allowed_origins" JSONB,
    "theme_overrides" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "embeddable_configs_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "embeddable_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_embeddable_configs" ("allowed_origins", "bot_id", "created_at", "id", "org_id", "theme_overrides") SELECT "allowed_origins", "bot_id", "created_at", "id", "org_id", "theme_overrides" FROM "embeddable_configs";
DROP TABLE "embeddable_configs";
ALTER TABLE "new_embeddable_configs" RENAME TO "embeddable_configs";
CREATE TABLE "new_feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_feedback" ("comment", "created_at", "id", "message_id", "rating", "user_id") SELECT "comment", "created_at", "id", "message_id", "rating", "user_id" FROM "feedback";
DROP TABLE "feedback";
ALTER TABLE "new_feedback" RENAME TO "feedback";
CREATE UNIQUE INDEX "feedback_message_id_key" ON "feedback"("message_id");
CREATE TABLE "new_invites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "org_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL,
    "used_by" TEXT,
    CONSTRAINT "invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_invites" ("code", "created_at", "expires_at", "id", "org_id", "role", "used_by") SELECT "code", "created_at", "expires_at", "id", "org_id", "role", "used_by" FROM "invites";
DROP TABLE "invites";
ALTER TABLE "new_invites" RENAME TO "invites";
CREATE UNIQUE INDEX "invites_code_key" ON "invites"("code");
CREATE TABLE "new_knowledge_bases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'upload',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_bases_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_knowledge_bases" ("bot_id", "created_at", "id", "name", "type") SELECT "bot_id", "created_at", "id", "name", "type" FROM "knowledge_bases";
DROP TABLE "knowledge_bases";
ALTER TABLE "new_knowledge_bases" RENAME TO "knowledge_bases";
CREATE TABLE "new_knowledge_chunks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kb_id" TEXT NOT NULL,
    "doc_id" TEXT,
    "content" TEXT NOT NULL,
    "embedding" JSONB,
    "metadata" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_chunks_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_bases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "knowledge_chunks_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "knowledge_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_knowledge_chunks" ("content", "created_at", "doc_id", "embedding", "id", "kb_id", "metadata") SELECT "content", "created_at", "doc_id", "embedding", "id", "kb_id", "metadata" FROM "knowledge_chunks";
DROP TABLE "knowledge_chunks";
ALTER TABLE "new_knowledge_chunks" RENAME TO "knowledge_chunks";
CREATE TABLE "new_knowledge_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kb_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_documents_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_bases" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_knowledge_documents" ("chunk_count", "created_at", "id", "kb_id", "name", "status") SELECT "chunk_count", "created_at", "id", "kb_id", "name", "status" FROM "knowledge_documents";
DROP TABLE "knowledge_documents";
ALTER TABLE "new_knowledge_documents" RENAME TO "knowledge_documents";
CREATE TABLE "new_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "sources" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_ms" INTEGER,
    "sentiment" TEXT,
    "language" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_messages" ("content", "conversation_id", "created_at", "id", "language", "pinned", "provider", "response_ms", "role", "sentiment", "sources") SELECT "content", "conversation_id", "created_at", "id", "language", "pinned", "provider", "response_ms", "role", "sentiment", "sources" FROM "messages";
DROP TABLE "messages";
ALTER TABLE "new_messages" RENAME TO "messages";
CREATE TABLE "new_organizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "max_bots" INTEGER NOT NULL DEFAULT 200,
    "max_messages_per_day" INTEGER NOT NULL DEFAULT 500,
    "max_members" INTEGER NOT NULL DEFAULT 10,
    CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_organizations" ("created_at", "id", "max_bots", "max_members", "max_messages_per_day", "name", "owner_id", "plan", "slug") SELECT "created_at", "id", "max_bots", "max_members", "max_messages_per_day", "name", "owner_id", "plan", "slug" FROM "organizations";
DROP TABLE "organizations";
ALTER TABLE "new_organizations" RENAME TO "organizations";
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "password_hash" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("avatar", "created_at", "email", "id", "name", "password_hash", "role", "token_version", "updated_at") SELECT "avatar", "created_at", "email", "id", "name", "password_hash", "role", "token_version", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

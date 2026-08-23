-- CreateTable
CREATE TABLE "bots" (
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
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "creation_method" TEXT NOT NULL DEFAULT 'factory'
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "conversations_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "sources" JSONB,
    "created_at" DATETIME NOT NULL,
    "response_ms" INTEGER,
    "sentiment" TEXT,
    "language" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "password_hash" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "org_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "org_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'upload',
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "knowledge_bases_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kb_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "knowledge_documents_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_bases" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kb_id" TEXT NOT NULL,
    "doc_id" TEXT,
    "content" TEXT NOT NULL,
    "embedding" JSONB,
    "metadata" JSONB,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "knowledge_chunks_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "knowledge_bases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "knowledge_chunks_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "knowledge_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT,
    "event_type" TEXT NOT NULL,
    "data" JSONB,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "analytics_events_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "feedback_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "agent_user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "created_at" DATETIME NOT NULL,
    "closed_at" DATETIME,
    CONSTRAINT "agent_sessions_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_sessions_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bot_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config_snapshot" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "bot_versions_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "embeddable_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot_id" TEXT NOT NULL,
    "org_id" TEXT,
    "allowed_origins" JSONB,
    "theme_overrides" JSONB,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "embeddable_configs_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "embeddable_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_org_id_user_id_key" ON "org_members"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_message_id_key" ON "feedback"("message_id");

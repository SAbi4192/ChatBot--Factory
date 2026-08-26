-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "org_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "created_at" DATETIME NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used_by" TEXT,
    CONSTRAINT "invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "creation_method" TEXT NOT NULL DEFAULT 'factory',
    "org_id" TEXT,
    CONSTRAINT "bots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_bots" ("avatar", "created_at", "creation_method", "description", "design_dna", "domain", "domain_profile", "favorite", "id", "name", "personality", "starter_questions", "subdomain", "system_prompt", "theme", "updated_at", "welcome_message") SELECT "avatar", "created_at", "creation_method", "description", "design_dna", "domain", "domain_profile", "favorite", "id", "name", "personality", "starter_questions", "subdomain", "system_prompt", "theme", "updated_at", "welcome_message" FROM "bots";
DROP TABLE "bots";
ALTER TABLE "new_bots" RENAME TO "bots";
CREATE TABLE "new_organizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "created_at" DATETIME NOT NULL,
    "max_bots" INTEGER NOT NULL DEFAULT 200,
    "max_messages_per_day" INTEGER NOT NULL DEFAULT 500,
    "max_members" INTEGER NOT NULL DEFAULT 10,
    CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_organizations" ("created_at", "id", "name", "owner_id", "plan", "slug") SELECT "created_at", "id", "name", "owner_id", "plan", "slug" FROM "organizations";
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
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("avatar", "created_at", "email", "id", "name", "password_hash", "role", "updated_at") SELECT "avatar", "created_at", "email", "id", "name", "password_hash", "role", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "invites_code_key" ON "invites"("code");

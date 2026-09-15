-- AlterTable: ship pipeline fields on bots (Export -> GitHub -> Render)
ALTER TABLE "bots" ADD COLUMN "repo_url" TEXT;
ALTER TABLE "bots" ADD COLUMN "repo_name" TEXT;
ALTER TABLE "bots" ADD COLUMN "deploy_url" TEXT;
ALTER TABLE "bots" ADD COLUMN "deploy_status" TEXT;
ALTER TABLE "bots" ADD COLUMN "render_service_id" TEXT;
ALTER TABLE "bots" ADD COLUMN "shipped_at" DATETIME;

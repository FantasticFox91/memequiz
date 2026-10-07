-- AlterTable
ALTER TABLE "results" ADD COLUMN "nickname_key" TEXT;

-- Backfill: у старых web-строк external_id и был ключом ника; для tg приближённо через lower()
UPDATE "results" SET "nickname_key" = CASE WHEN "source" = 'web' THEN "external_id" ELSE lower("nickname") END;

ALTER TABLE "results" ALTER COLUMN "nickname_key" SET NOT NULL;

-- CreateIndex
CREATE INDEX "results_nickname_key_idx" ON "results"("nickname_key");

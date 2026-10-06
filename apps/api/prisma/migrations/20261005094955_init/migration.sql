-- CreateEnum
CREATE TYPE "ParticipantSource" AS ENUM ('web', 'tg');

-- CreateTable
CREATE TABLE "results" (
    "id" SERIAL NOT NULL,
    "source" "ParticipantSource" NOT NULL,
    "external_id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMPTZ(3),

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "results_score_created_at_idx" ON "results"("score" DESC, "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "results_source_external_id_key" ON "results"("source", "external_id");

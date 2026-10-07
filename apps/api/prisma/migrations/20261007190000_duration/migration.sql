-- AlterTable
ALTER TABLE "results" ADD COLUMN "duration_ms" INTEGER;

-- CreateTable
CREATE TABLE "quiz_starts" (
    "source" "ParticipantSource" NOT NULL,
    "external_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_starts_pkey" PRIMARY KEY ("source","external_id")
);

-- Лидерборд: баллы, при равенстве быстрее выше, затем кто раньше
DROP INDEX "results_score_created_at_idx";
CREATE INDEX "results_score_duration_ms_created_at_idx" ON "results"("score" DESC, "duration_ms", "created_at");

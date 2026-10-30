-- Несколько викторин: у каждой своя засчитанная попытка, старт и лидерборд.
-- Всё, что было до этого, — результаты викторины по мемам (content/quizzes/memes.json)

-- AlterTable
ALTER TABLE "results" ADD COLUMN "quiz_id" TEXT NOT NULL DEFAULT 'memes';
ALTER TABLE "results" ALTER COLUMN "quiz_id" DROP DEFAULT;

ALTER TABLE "quiz_starts" ADD COLUMN "quiz_id" TEXT NOT NULL DEFAULT 'memes';
ALTER TABLE "quiz_starts" ALTER COLUMN "quiz_id" DROP DEFAULT;
ALTER TABLE "quiz_starts" DROP CONSTRAINT "quiz_starts_pkey";
ALTER TABLE "quiz_starts" ADD CONSTRAINT "quiz_starts_pkey" PRIMARY KEY ("source", "external_id", "quiz_id");

-- одна засчитанная попытка на участника в каждой викторине
DROP INDEX "results_source_external_id_key";
CREATE UNIQUE INDEX "results_source_external_id_quiz_id_key" ON "results"("source", "external_id", "quiz_id");

-- лидерборд викторины: баллы, при равенстве быстрее выше, затем кто раньше
DROP INDEX "results_score_duration_ms_created_at_idx";
CREATE INDEX "results_quiz_id_score_duration_ms_created_at_idx" ON "results"("quiz_id", "score" DESC, "duration_ms", "created_at");

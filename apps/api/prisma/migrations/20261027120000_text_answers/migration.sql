-- CreateTable
CREATE TABLE "text_answers" (
    "id" SERIAL NOT NULL,
    "result_id" INTEGER NOT NULL,
    "question_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "text_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "text_answers_result_id_question_id_key" ON "text_answers"("result_id", "question_id");

-- CreateIndex
CREATE INDEX "text_answers_reviewed_question_id_idx" ON "text_answers"("reviewed", "question_id");

-- AddForeignKey
ALTER TABLE "text_answers" ADD CONSTRAINT "text_answers_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

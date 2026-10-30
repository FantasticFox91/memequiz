-- Текстовый ответ оценивается в 0..2 балла вместо «засчитан / нет».
-- Старые засчитанные ответы стоили 1 балл в results.score — так и остаются
ALTER TABLE "text_answers" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;
UPDATE "text_answers" SET "points" = CASE WHEN "accepted" THEN 1 ELSE 0 END;
ALTER TABLE "text_answers" ALTER COLUMN "points" DROP DEFAULT;
ALTER TABLE "text_answers" DROP COLUMN "accepted";

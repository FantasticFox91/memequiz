-- Викторина who: верный ответ стоит 1 балл вместо 2 (textPoints: 1), в ней только текстовые ответы.
-- Пересчитываем результаты, сохранённые до этого: +2 становится +1, total — число ответов
UPDATE "results" AS r
SET "score" = r."score" - a."excess", "total" = a."answers"
FROM (
  SELECT "result_id", SUM(GREATEST("points" - 1, 0))::int AS "excess", COUNT(*)::int AS "answers"
  FROM "text_answers"
  GROUP BY "result_id"
) AS a
WHERE a."result_id" = r."id" AND r."quiz_id" = 'who';

UPDATE "text_answers" AS a
SET "points" = 1
FROM "results" AS r
WHERE r."id" = a."result_id" AND r."quiz_id" = 'who' AND a."points" > 1;

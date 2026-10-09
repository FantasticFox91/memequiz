import { z } from 'zod';
import { nicknameSchema } from './participant';
import { publicRoundSchema } from './quiz';

// GET /api/quiz
export const quizResponseSchema = z.array(publicRoundSchema);

// POST /api/quiz/submit
// формат здесь; количество ответов и принадлежность вариантов проверяет сервер по questions.json
export const answerSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
});

// nickname: обязателен на сайте; в Telegram игнорируется, ник берётся из профиля
export const submitRequestSchema = z.object({
  nickname: nicknameSchema.optional(),
  answers: z.array(answerSchema).min(1),
});

// durationMs: время прохождения по часам сервера; null — у старых результатов
export const quizResultSchema = z.object({
  nickname: z.string(),
  score: z.int(),
  total: z.int(),
  durationMs: z.int().nullable(),
  createdAt: z.iso.datetime(),
});

export const attemptScoreSchema = z.object({
  score: z.int(),
  total: z.int(),
});

// result — засчитанный (первый) результат; attempt — баллы этой попытки.
// isFirst: false — участник уже проходил, попытка «для себя» и в зачёт не идёт
export const submitResponseSchema = z.object({
  result: quizResultSchema,
  attempt: attemptScoreSchema,
  isFirst: z.boolean(),
});

// POST /api/quiz/start — отметка начала (204). Время засчитанной попытки считается от первой отметки

// GET /api/me/status[?nickname=...]
// участник — кука (сайт) или initData (Telegram). nickname на сайте — проверить, не занят ли он:
// если не проходил и ник занят другим, ответ 409
export const statusQuerySchema = z.object({
  nickname: nicknameSchema.optional(),
});

export const statusResponseSchema = z.discriminatedUnion('completed', [
  z.object({ completed: z.literal(false) }),
  z.object({ completed: z.literal(true), result: quizResultSchema }),
]);

// GET /api/leaderboard?limit=50
export const LEADERBOARD_DEFAULT_LIMIT = 50;
export const LEADERBOARD_MAX_LIMIT = 100;

export const leaderboardQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LEADERBOARD_MAX_LIMIT)
    .default(LEADERBOARD_DEFAULT_LIMIT),
});

// rank: место по порядку score DESC, durationMs ASC (null в конце), createdAt ASC:
// при равенстве баллов выше тот, кто быстрее, затем тот, кто раньше
export const leaderboardEntrySchema = quizResultSchema.extend({
  rank: z.int().positive(),
});

export const leaderboardResponseSchema = z.array(leaderboardEntrySchema);

// GET /api/bot — username бота для ссылки «Поделиться» из Telegram (t.me/<username>?startapp).
// null — бот выключен или ещё не запустился: тогда делимся ссылкой на сайт
export const botInfoResponseSchema = z.object({
  username: z.string().nullable(),
});

export type QuizResponse = z.infer<typeof quizResponseSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type SubmitRequest = z.infer<typeof submitRequestSchema>;
export type QuizResult = z.infer<typeof quizResultSchema>;
export type AttemptScore = z.infer<typeof attemptScoreSchema>;
export type SubmitResponse = z.infer<typeof submitResponseSchema>;
export type StatusQuery = z.infer<typeof statusQuerySchema>;
export type StatusResponse = z.infer<typeof statusResponseSchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
export type BotInfoResponse = z.infer<typeof botInfoResponseSchema>;

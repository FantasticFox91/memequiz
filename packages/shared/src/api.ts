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

export const submitRequestSchema = z.object({
  nickname: nicknameSchema,
  answers: z.array(answerSchema).min(1),
});

export const quizResultSchema = z.object({
  nickname: z.string(),
  score: z.int(),
  total: z.int(),
  createdAt: z.iso.datetime(),
});

// isFirst: false — участник уже проходил, в result его первый результат
export const submitResponseSchema = z.object({
  result: quizResultSchema,
  isFirst: z.boolean(),
});

// GET /api/me/status?nickname=...
export const statusQuerySchema = z.object({
  nickname: nicknameSchema,
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

// rank: место по порядку score DESC, createdAt ASC; при равенстве баллов выше тот, кто раньше
export const leaderboardEntrySchema = quizResultSchema.extend({
  rank: z.int().positive(),
});

export const leaderboardResponseSchema = z.array(leaderboardEntrySchema);

export type QuizResponse = z.infer<typeof quizResponseSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type SubmitRequest = z.infer<typeof submitRequestSchema>;
export type QuizResult = z.infer<typeof quizResultSchema>;
export type SubmitResponse = z.infer<typeof submitResponseSchema>;
export type StatusQuery = z.infer<typeof statusQuerySchema>;
export type StatusResponse = z.infer<typeof statusResponseSchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;

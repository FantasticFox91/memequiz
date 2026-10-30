import { z } from 'zod';
import { nicknameSchema } from './participant';
import {
  ANSWER_TEXT_MAX,
  publicRoundSchema,
  quizIdSchema,
  quizInfoSchema,
  textAnswerPointsSchema,
} from './quiz';

// GET /api/quizzes — все викторины в порядке order, черновики с draft: true
export const quizzesResponseSchema = z.array(quizInfoSchema);

// GET /api/quiz/:quizId
export const quizResponseSchema = z.array(publicRoundSchema);

// POST /api/quiz/:quizId/submit
// формат здесь; количество ответов и принадлежность вариантов проверяет сервер по файлу викторины.
// optionId — для вопросов с вариантами, text — для вопросов с вводом ответа
export const answerSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1).optional(),
  text: z.string().max(ANSWER_TEXT_MAX).optional(),
});

// nickname: обязателен на сайте; в Telegram игнорируется, ник берётся из профиля
export const submitRequestSchema = z.object({
  nickname: nicknameSchema.optional(),
  answers: z.array(answerSchema).min(1),
});

// durationMs: время прохождения по часам сервера; null — у старых результатов.
// pending: текстовые ответы ещё не проверены админом — score скрыт (null), в лидерборде результата нет.
// total — максимум баллов (текстовый ответ стоит TEXT_ANSWER_MAX_POINTS)
export const quizResultSchema = z.object({
  quizId: z.string(),
  nickname: z.string(),
  score: z.int().nullable(),
  pending: z.boolean(),
  total: z.int(),
  durationMs: z.int().nullable(),
  createdAt: z.iso.datetime(),
});

// score: null — засчитанная попытка ждёт проверки текстовых ответов.
// У попытки «для себя» текстовые ответы оцениваются только автопроверкой
export const attemptScoreSchema = z.object({
  score: z.int().nullable(),
  total: z.int(),
});

// result — засчитанный (первый) результат; attempt — баллы этой попытки.
// isFirst: false — участник уже проходил, попытка «для себя» и в зачёт не идёт
export const submitResponseSchema = z.object({
  result: quizResultSchema,
  attempt: attemptScoreSchema,
  isFirst: z.boolean(),
});

// POST /api/quiz/:quizId/start — отметка начала (204). Время засчитанной попытки считается от первой отметки

// GET /api/me/status[?nickname=...]
// участник — кука (сайт) или initData (Telegram). nickname на сайте — проверить, не занят ли он:
// если ещё ничего не проходил и ник занят другим, ответ 409
export const statusQuerySchema = z.object({
  nickname: nicknameSchema.optional(),
});

// nickname — ник засчитанных результатов (после первой викторины ник не меняется), null — ещё не проходил.
// results — засчитанные результаты по id викторины
export const statusResponseSchema = z.object({
  nickname: z.string().nullable(),
  results: z.record(z.string(), quizResultSchema),
});

// GET /api/leaderboard?quiz=memes&limit=50
export const LEADERBOARD_DEFAULT_LIMIT = 50;
export const LEADERBOARD_MAX_LIMIT = 100;

export const leaderboardQuerySchema = z.object({
  quiz: quizIdSchema,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LEADERBOARD_MAX_LIMIT)
    .default(LEADERBOARD_DEFAULT_LIMIT),
});

// только проверенные результаты (pending: false); rank: место по порядку score DESC, durationMs ASC (null в конце), createdAt ASC:
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

// --- Админка: ручная проверка текстовых ответов. Вход по ADMIN_USERNAME / ADMIN_PASSWORD, сессия в куке ---

// POST /api/admin/login — 204 и кука сессии, неверные данные — 401. POST /api/admin/logout — 204
export const adminLoginRequestSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

// GET /api/admin/answers?filter=pending|all — pending: ещё без ручного вердикта
export const adminAnswersQuerySchema = z.object({
  filter: z.enum(['pending', 'all']).default('pending'),
});

// вопросы с вводом текста в порядке файла; answers — только засчитанные попытки
export const adminAnswersResponseSchema = z.object({
  questions: z.array(
    z.object({
      quizId: z.string(),
      quizTitle: z.string(),
      id: z.string(),
      roundTitle: z.string(),
      text: z.string(),
      acceptedAnswers: z.array(z.string()),
    }),
  ),
  answers: z.array(
    z.object({
      id: z.int(),
      quizId: z.string(),
      questionId: z.string(),
      text: z.string(),
      nickname: z.string(),
      // до проверки — предложение автопроверки
      points: textAnswerPointsSchema,
      reviewed: z.boolean(),
    }),
  ),
});

// POST /api/admin/answers/verdict — оценка сразу пачке (одинаковые ответы разных людей): 0, 1 или 2.
// Результат попадает в лидерборд, когда проверены все его текстовые ответы
export const adminVerdictRequestSchema = z.object({
  ids: z.array(z.int().positive()).min(1).max(1000),
  points: textAnswerPointsSchema,
});

export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;
export type AdminAnswersQuery = z.infer<typeof adminAnswersQuerySchema>;
export type AdminAnswersResponse = z.infer<typeof adminAnswersResponseSchema>;
export type AdminAnswer = AdminAnswersResponse['answers'][number];
export type AdminVerdictRequest = z.infer<typeof adminVerdictRequestSchema>;

export type QuizzesResponse = z.infer<typeof quizzesResponseSchema>;
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

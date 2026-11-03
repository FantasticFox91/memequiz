import { z } from 'zod';

export const questionTypeSchema = z.enum(['guess-meme', 'continue-phrase', 'guess-song']);

export const questionOptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id варианта: латиница в нижнем регистре, цифры, -'),
  text: z.string().trim().min(1),
});

// базовый объект без refine: от него строится публичная схема (.omit на refined-схеме не работает)
const questionBaseSchema = z.object({
  // стабильный id, по нему считаются баллы; после запуска не менять
  id: z.string().regex(/^[a-z0-9-]+$/, 'id вопроса: латиница в нижнем регистре, цифры, -'),
  type: questionTypeSchema.optional(),
  // пути относительно статики фронта: apps/web/public/memes/*, apps/web/public/audio/*.
  // нужна картинка, песня или обе; имя аудиофайла видно в сети, ответ в нём не писать
  image: z
    .string()
    .regex(/^\/memes\/[\w.-]+\.webp$/, 'image: /memes/<имя>.webp')
    .optional(),
  imageAlt: z.string().trim().min(1).optional(),
  audio: z
    .string()
    .regex(/^\/audio\/[\w.-]+\.(mp3|m4a)$/, 'audio: /audio/<имя>.mp3 или .m4a')
    .optional(),
  text: z.string().trim().min(1),
  // два вида вопроса: варианты + correctId или ввод текста + acceptedAnswers (без options)
  options: z.array(questionOptionSchema).min(2).max(4).optional(),
  correctId: z.string().optional(),
  // засчитываемые ответы; сравниваются после normalizeAnswer и с допуском на опечатки
  acceptedAnswers: z.array(z.string().trim().min(1)).min(1).optional(),
});

export const ANSWER_TEXT_MAX = 200;

// вопрос с вариантами — 1 балл; текстовый ответ админ оценивает в 0, 1 или 2 балла
// (например, 1 — угадан только исполнитель). Автопроверка по acceptedAnswers предлагает 2 или 0
export const TEXT_ANSWER_MAX_POINTS = 2;
export const textAnswerPointsSchema = z.int().min(0).max(TEXT_ANSWER_MAX_POINTS);

export function questionMaxPoints(question: { options?: unknown }): number {
  return question.options ? 1 : TEXT_ANSWER_MAX_POINTS;
}

// для сравнения текстовых ответов: регистр, ё/е, пунктуация и лишние пробелы не важны
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const questionSchema = questionBaseSchema.superRefine((q, ctx) => {
  if (!q.image && !q.audio) {
    ctx.addIssue({ code: 'custom', path: ['image'], message: 'нужен image или audio' });
  }
  if (q.image && !q.imageAlt) {
    ctx.addIssue({ code: 'custom', path: ['imageAlt'], message: 'imageAlt обязателен с image' });
  }
  if (!q.options) {
    if (!q.acceptedAnswers) {
      ctx.addIssue({
        code: 'custom',
        path: ['acceptedAnswers'],
        message: 'нужны options с correctId или acceptedAnswers для ввода текста',
      });
    }
    q.acceptedAnswers?.forEach((answer, i) => {
      if (!normalizeAnswer(answer)) {
        ctx.addIssue({
          code: 'custom',
          path: ['acceptedAnswers', i],
          message: 'ответ без букв и цифр',
        });
      }
    });
    return;
  }
  if (q.acceptedAnswers) {
    ctx.addIssue({
      code: 'custom',
      path: ['acceptedAnswers'],
      message: 'acceptedAnswers только у вопросов без options',
    });
  }
  const ids = q.options.map((o) => o.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: `дубль id варианта "${dup}"` });
  }
  if (!q.correctId || !ids.includes(q.correctId)) {
    ctx.addIssue({
      code: 'custom',
      path: ['correctId'],
      message: `correctId "${q.correctId}" нет среди вариантов`,
    });
  }
});

const roundBaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id раунда: латиница в нижнем регистре, цифры, -'),
  title: z.string().trim().min(1),
  // подзаголовок на заставке раунда
  description: z.string().trim().min(1).optional(),
});

export const roundSchema = roundBaseSchema
  .extend({
    questions: z.array(questionSchema).min(1),
    // сколько случайных вопросов раунда достаётся участнику; без pick — все.
    // Выбор зависит от участника и не меняется при перезагрузке (пока не меняется список вопросов)
    pick: z.int().positive().optional(),
  })
  .refine((r) => r.pick === undefined || r.pick <= r.questions.length, {
    path: ['pick'],
    message: 'pick больше числа вопросов раунда',
  });

// сколько вопросов раунда получает один участник
export function roundSize(round: { questions: readonly unknown[]; pick?: number }): number {
  return Math.min(round.pick ?? round.questions.length, round.questions.length);
}

// раунды идут в порядке файла; id вопросов уникальны по всей викторине, баллы считаются за вопрос
export const roundsSchema = z
  .array(roundSchema)
  .min(1)
  .superRefine((rounds, ctx) => {
    const roundIds = new Set<string>();
    const questionIds = new Set<string>();
    rounds.forEach((r, i) => {
      if (roundIds.has(r.id)) {
        ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `дубль id раунда "${r.id}"` });
      }
      roundIds.add(r.id);
      r.questions.forEach((q, j) => {
        if (questionIds.has(q.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'questions', j, 'id'],
            message: `дубль id вопроса "${q.id}"`,
          });
        }
        questionIds.add(q.id);
      });
    });
  });

// id викторины = имя файла apps/api/content/quizzes/<id>.json; по нему хранятся результаты, не менять
export const quizIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'id викторины: латиница в нижнем регистре, цифры, -');

// файл викторины. У каждой свои вопросы, своя засчитанная попытка и свой лидерборд
export const quizFileSchema = z.object({
  title: z.string().trim().min(1),
  emoji: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  // порядок кнопок на главной
  order: z.int().default(0),
  // черновик: на проде кнопка «Скоро» и api отдаёт 404; локально играется, без файлов только warning
  draft: z.boolean().default(false),
  rounds: roundsSchema,
});

// GET /api/quizzes — кнопки на главной
export const quizInfoSchema = z.object({
  id: quizIdSchema,
  title: z.string(),
  emoji: z.string().optional(),
  description: z.string().optional(),
  draft: z.boolean(),
  total: z.int(),
});

// то, что уходит на фронт: без правильного ответа. Нет options — фронт показывает поле ввода
export const publicQuestionSchema = questionBaseSchema.omit({
  correctId: true,
  acceptedAnswers: true,
});

export const publicRoundSchema = roundBaseSchema.extend({
  questions: z.array(publicQuestionSchema),
});

export type QuestionType = z.infer<typeof questionTypeSchema>;
export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;
export type Round = z.infer<typeof roundSchema>;
export type PublicRound = z.infer<typeof publicRoundSchema>;
export type QuizFile = z.infer<typeof quizFileSchema>;
export type QuizInfo = z.infer<typeof quizInfoSchema>;

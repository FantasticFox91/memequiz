import { z } from 'zod';

export const questionTypeSchema = z.enum(['guess-meme', 'continue-phrase']);

export const questionOptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id варианта: латиница в нижнем регистре, цифры, -'),
  text: z.string().trim().min(1),
});

// базовый объект без refine: от него строится публичная схема (.omit на refined-схеме не работает)
const questionBaseSchema = z.object({
  // стабильный id, по нему считаются баллы; после запуска не менять
  id: z.string().regex(/^[a-z0-9-]+$/, 'id вопроса: латиница в нижнем регистре, цифры, -'),
  type: questionTypeSchema.optional(),
  // путь относительно статики фронта: apps/web/public/memes/*
  image: z.string().regex(/^\/memes\/[\w.-]+\.webp$/, 'image: /memes/<имя>.webp'),
  imageAlt: z.string().trim().min(1),
  text: z.string().trim().min(1),
  options: z.array(questionOptionSchema).min(2).max(4),
  correctId: z.string(),
});

export const questionSchema = questionBaseSchema.superRefine((q, ctx) => {
  const ids = q.options.map((o) => o.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: `дубль id варианта "${dup}"` });
  }
  if (!ids.includes(q.correctId)) {
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

export const roundSchema = roundBaseSchema.extend({
  questions: z.array(questionSchema).min(1),
});

// раунды идут в порядке файла; id вопросов уникальны по всей викторине, баллы считаются за вопрос
export const quizFileSchema = z
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

// то, что уходит на фронт: без правильного ответа
export const publicQuestionSchema = questionBaseSchema.omit({ correctId: true });

export const publicRoundSchema = roundBaseSchema.extend({
  questions: z.array(publicQuestionSchema),
});

export type QuestionType = z.infer<typeof questionTypeSchema>;
export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;
export type Round = z.infer<typeof roundSchema>;
export type PublicRound = z.infer<typeof publicRoundSchema>;

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import {
  type Question,
  type QuizInfo,
  type Round,
  questionMaxPoints,
  quizFileSchema,
  quizIdSchema,
} from '@memequiz/shared';
import { z } from 'zod';

// dist/quiz/*.js → apps/api/content/quizzes (в Docker: /app/content/quizzes)
const QUIZZES_DIR = resolve(__dirname, '../../content/quizzes');
// статика фронта есть только в монорепо; в Docker-образе api её нет, проверка файлов пропускается
const WEB_PUBLIC_DIR = resolve(__dirname, '../../../web/public');

export type Quiz = {
  id: string;
  title: string;
  emoji?: string;
  description?: string;
  order: number;
  draft: boolean;
  rounds: readonly Round[];
  // все вопросы всех раундов подряд: для подсчёта баллов раунды не важны
  questions: readonly Question[];
  byId: ReadonlyMap<string, Question>;
  // число вопросов
  total: number;
  // максимум баллов: текстовый ответ стоит больше вопроса с вариантами
  maxScore: number;
};

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);
  private readonly quizzes: readonly Quiz[];
  private readonly byId: ReadonlyMap<string, Quiz>;

  // загрузка в конструкторе: при невалидном файле Nest падает на старте
  constructor() {
    this.quizzes = loadQuizzes();
    this.byId = new Map(this.quizzes.map((q) => [q.id, q]));
    this.quizzes.forEach((quiz) => this.checkMedia(quiz));
    const summary = this.quizzes
      .map((q) => `${q.id}${q.draft ? ' (draft)' : ''}: ${q.total}`)
      .join(', ');
    this.logger.log(`Loaded ${this.quizzes.length} quizzes: ${summary}`);
  }

  // в порядке order, вместе с черновиками
  list(): readonly Quiz[] {
    return this.quizzes;
  }

  get(id: string): Quiz | undefined {
    return this.byId.get(id);
  }

  info(quiz: Quiz): QuizInfo {
    const { id, title, emoji, description, draft, total } = quiz;
    return { id, title, emoji, description, draft, total };
  }

  // у черновика файлов может ещё не быть: только предупреждаем
  private checkMedia(quiz: Quiz) {
    if (!existsSync(WEB_PUBLIC_DIR)) {
      this.logger.warn(`${WEB_PUBLIC_DIR} not found, skipping media check`);
      return;
    }
    const missing = quiz.questions.flatMap((q) =>
      [q.image, q.audio]
        .filter((path): path is string => !!path && !existsSync(join(WEB_PUBLIC_DIR, path)))
        .map((path) => `  ${q.id}: ${path}`),
    );
    if (missing.length === 0) return;
    const message = `Missing media files in quiz "${quiz.id}":\n${missing.join('\n')}`;
    if (quiz.draft) this.logger.warn(message);
    else throw new Error(message);
  }
}

function loadQuizzes(): Quiz[] {
  let files: string[];
  try {
    files = readdirSync(QUIZZES_DIR).filter((f) => f.endsWith('.json'));
  } catch (e) {
    throw new Error(`Cannot read ${QUIZZES_DIR}: ${(e as Error).message}`);
  }
  if (files.length === 0) throw new Error(`No quizzes in ${QUIZZES_DIR}`);

  const quizzes = files.map((file) => {
    const id = basename(file, '.json');
    if (!quizIdSchema.safeParse(id).success) {
      throw new Error(`Invalid quiz file name "${file}": только a-z, 0-9 и -`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(QUIZZES_DIR, file), 'utf8'));
    } catch (e) {
      throw new Error(`Cannot read ${file}: ${(e as Error).message}`);
    }
    const result = quizFileSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Invalid ${file}:\n${z.prettifyError(result.error)}`);
    }
    const { rounds, ...meta } = result.data;
    const questions = rounds.flatMap((r) => r.questions);
    return {
      id,
      ...meta,
      rounds,
      questions,
      byId: new Map(questions.map((q) => [q.id, q])),
      total: questions.length,
      maxScore: questions.reduce((sum, q) => sum + questionMaxPoints(q), 0),
    };
  });
  return quizzes.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

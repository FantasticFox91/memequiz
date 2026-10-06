import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { type Question, type Round, quizFileSchema } from '@memequiz/shared';
import { z } from 'zod';

// dist/quiz/*.js → apps/api/content (в Docker: /app/content)
const QUESTIONS_PATH = resolve(__dirname, '../../content/questions.json');
// статика фронта есть только в монорепо; в Docker-образе api её нет, проверка картинок пропускается
const WEB_PUBLIC_DIR = resolve(__dirname, '../../../web/public');

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);
  private readonly rounds: readonly Round[];
  private readonly questions: readonly Question[];
  private readonly byId: ReadonlyMap<string, Question>;

  // загрузка в конструкторе: при невалидном файле Nest падает на старте
  constructor() {
    this.rounds = loadRounds();
    this.questions = this.rounds.flatMap((r) => r.questions);
    this.byId = new Map(this.questions.map((q) => [q.id, q]));
    this.checkImages();
    this.logger.log(`Loaded ${this.rounds.length} rounds, ${this.questions.length} questions`);
  }

  getRounds(): readonly Round[] {
    return this.rounds;
  }

  // все вопросы всех раундов подряд: для подсчёта баллов раунды не важны
  getAll(): readonly Question[] {
    return this.questions;
  }

  getById(id: string): Question | undefined {
    return this.byId.get(id);
  }

  get total(): number {
    return this.questions.length;
  }

  private checkImages() {
    if (!existsSync(WEB_PUBLIC_DIR)) {
      this.logger.warn(`${WEB_PUBLIC_DIR} not found, skipping image check`);
      return;
    }
    const missing = this.questions.filter((q) => !existsSync(join(WEB_PUBLIC_DIR, q.image)));
    if (missing.length > 0) {
      throw new Error(`Missing images:\n${missing.map((q) => `  ${q.id}: ${q.image}`).join('\n')}`);
    }
  }
}

function loadRounds(): Round[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot read ${QUESTIONS_PATH}: ${(e as Error).message}`);
  }
  const result = quizFileSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid questions.json:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

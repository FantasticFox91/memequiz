import { BadRequestException, Injectable } from '@nestjs/common';
import type { Answer, PublicRound } from '@memequiz/shared';
import { QuestionsService } from './questions.service';
import { toPublicRound } from './quiz.mapper';

// Fisher–Yates, возвращает новый массив
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

@Injectable()
export class QuizService {
  constructor(private readonly questions: QuestionsService) {}

  // порядок раундов как в файле; вопросы внутри раунда и варианты перемешиваются на каждый запрос
  // (фронт держит порядок своей попытки в сохранённом прогрессе)
  getPublicRounds(): PublicRound[] {
    return this.questions.getRounds().map((round) => {
      const publicRound = toPublicRound(round);
      return {
        ...publicRound,
        questions: shuffle(publicRound.questions).map((q) => ({
          ...q,
          options: shuffle(q.options),
        })),
      };
    });
  }

  // баллы считаются только здесь, по questions.json; на любой непорядок в ответах — 400
  score(answers: readonly Answer[]): { score: number; total: number } {
    const total = this.questions.total;
    const issues: string[] = [];

    if (answers.length !== total) {
      issues.push(`ожидается ${total} ответов, получено ${answers.length}`);
    }

    const seen = new Set<string>();
    let score = 0;
    for (const { questionId, optionId } of answers) {
      const question = this.questions.getById(questionId);
      if (!question) {
        issues.push(`неизвестный вопрос "${questionId}"`);
        continue;
      }
      if (seen.has(questionId)) {
        issues.push(`повторный ответ на вопрос "${questionId}"`);
        continue;
      }
      seen.add(questionId);
      if (!question.options.some((o) => o.id === optionId)) {
        issues.push(`у вопроса "${questionId}" нет варианта "${optionId}"`);
        continue;
      }
      if (optionId === question.correctId) score++;
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: issues.map((message) => ({ path: 'answers', message })),
      });
    }
    return { score, total };
  }
}

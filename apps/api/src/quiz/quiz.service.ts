import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type Answer,
  type PublicRound,
  type QuizInfo,
  TEXT_ANSWER_MAX_POINTS,
} from '@memequiz/shared';
import type { Env } from '../config/env';
import type { TextAnswer } from '../results/results.service';
import { isAcceptedAnswer } from './answer-match';
import { type Quiz, QuestionsService } from './questions.service';
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
  // черновики играются везде, кроме прода
  private readonly draftsPlayable: boolean;

  constructor(
    private readonly questions: QuestionsService,
    config: ConfigService<Env, true>,
  ) {
    this.draftsPlayable = config.get('NODE_ENV', { infer: true }) !== 'production';
  }

  list(): QuizInfo[] {
    return this.questions.list().map((quiz) => ({
      ...this.questions.info(quiz),
      draft: quiz.draft && !this.draftsPlayable,
    }));
  }

  // неизвестная викторина и черновик на проде — 404
  getQuiz(id: string): Quiz {
    const quiz = this.questions.get(id);
    if (!quiz || (quiz.draft && !this.draftsPlayable)) {
      throw new NotFoundException(`Quiz "${id}" not found`);
    }
    return quiz;
  }

  // порядок раундов как в файле; вопросы внутри раунда и варианты перемешиваются на каждый запрос
  // (фронт держит порядок своей попытки в сохранённом прогрессе)
  getPublicRounds(quiz: Quiz): PublicRound[] {
    return quiz.rounds.map((round) => {
      const publicRound = toPublicRound(round);
      return {
        ...publicRound,
        questions: shuffle(publicRound.questions).map((q) =>
          q.options ? { ...q, options: shuffle(q.options) } : q,
        ),
      };
    });
  }

  // баллы считаются только здесь, по файлу викторины; на любой непорядок в ответах — 400.
  // textAnswers — текстовые ответы с оценкой автопроверки, для ручной проверки в админке.
  // total — максимум баллов, не число вопросов
  score(
    quiz: Quiz,
    answers: readonly Answer[],
  ): { score: number; total: number; textAnswers: TextAnswer[] } {
    const total = quiz.maxScore;
    const issues: string[] = [];
    const textAnswers: TextAnswer[] = [];

    if (answers.length !== quiz.total) {
      issues.push(`ожидается ${quiz.total} ответов, получено ${answers.length}`);
    }

    const seen = new Set<string>();
    let score = 0;
    for (const { questionId, optionId, text } of answers) {
      const question = quiz.byId.get(questionId);
      if (!question) {
        issues.push(`неизвестный вопрос "${questionId}"`);
        continue;
      }
      if (seen.has(questionId)) {
        issues.push(`повторный ответ на вопрос "${questionId}"`);
        continue;
      }
      seen.add(questionId);
      if (!question.options) {
        if (text === undefined) {
          issues.push(`у вопроса "${questionId}" нужен текстовый ответ`);
          continue;
        }
        const points = isAcceptedAnswer(text, question.acceptedAnswers ?? [])
          ? TEXT_ANSWER_MAX_POINTS
          : 0;
        score += points;
        textAnswers.push({ questionId, text: text.trim(), points });
        continue;
      }
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
    return { score, total, textAnswers };
  }
}

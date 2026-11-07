import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  type Answer,
  type Participant,
  type PublicRound,
  type QuizInfo,
  type Round,
  TEXT_ANSWER_MAX_POINTS,
  questionMaxPoints,
  roundSize,
} from '@memequiz/shared';
import type { Env } from '../config/env';
import type { TextAnswer } from '../results/results.service';
import { isAcceptedAnswer } from './answer-match';
import { type Quiz, QuestionsService } from './questions.service';
import { toPublicRound } from './quiz.mapper';

type ParticipantKey = Pick<Participant, 'source' | 'externalId'>;

// Fisher–Yates, возвращает новый массив
function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// детерминированный генератор (mulberry32), зерно — хэш строки
function seededRandom(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

  /**
   * Раунды с вопросами, которые достались участнику. В раунде с pick — случайные pick вопросов,
   * но случайность детерминирована участником: перезагрузка и повторная попытка дают тот же набор,
   * поэтому сервер может проверить ответы без хранения выбора. Порядок — как в файле.
   */
  roundsFor(quiz: Quiz, participant: ParticipantKey, startedAt: Date | null): Round[] {
    // startedAt — первая отметка старта (quiz_starts): живёт всю попытку, а сброс результата в БД
    // удаляет её вместе с результатом — после сброса участнику выпадает новый набор
    const attempt = startedAt?.getTime() ?? 'none';
    return quiz.rounds.map((round) => {
      if (roundSize(round) === round.questions.length) return round;
      const random = seededRandom(
        `${participant.source}:${participant.externalId}:${quiz.id}:${round.id}:${attempt}`,
      );
      const picked = new Set(shuffle(round.questions, random).slice(0, roundSize(round)));
      return { ...round, questions: round.questions.filter((q) => picked.has(q)) };
    });
  }

  // вопросы внутри раунда и варианты перемешиваются на каждый запрос
  // (фронт держит порядок своей попытки в сохранённом прогрессе)
  getPublicRounds(rounds: readonly Round[]): PublicRound[] {
    return rounds.map((round) => {
      const publicRound = toPublicRound(round);
      return {
        ...publicRound,
        questions: shuffle(publicRound.questions).map((q) =>
          q.options ? { ...q, options: shuffle(q.options) } : q,
        ),
      };
    });
  }

  // баллы считаются только здесь, по вопросам участника (roundsFor); на любой непорядок в ответах — 400.
  // textAnswers — текстовые ответы с оценкой автопроверки, для ручной проверки в админке.
  // total — максимум баллов, не число вопросов
  score(
    rounds: readonly Round[],
    answers: readonly Answer[],
  ): { score: number; total: number; textAnswers: TextAnswer[] } {
    const questions = rounds.flatMap((r) => r.questions);
    const byId = new Map(questions.map((q) => [q.id, q]));
    const total = questions.reduce((sum, q) => sum + questionMaxPoints(q), 0);
    const issues: string[] = [];
    const textAnswers: TextAnswer[] = [];

    if (answers.length !== questions.length) {
      issues.push(`ожидается ${questions.length} ответов, получено ${answers.length}`);
    }

    const seen = new Set<string>();
    let score = 0;
    for (const { questionId, optionId, text } of answers) {
      const question = byId.get(questionId);
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

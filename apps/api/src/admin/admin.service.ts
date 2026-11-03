import { Injectable } from '@nestjs/common';
import type {
  AdminAnswersQuery,
  AdminAnswersResponse,
  AdminParticipantsResponse,
} from '@memequiz/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from '../quiz/questions.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsService,
  ) {}

  // вопросы с вводом текста всех викторин в порядке файлов.
  // Черновики тоже: локально в них могли уже ответить
  private textQuestions(): AdminAnswersResponse['questions'] {
    return this.questions.list().flatMap((quiz) =>
      quiz.rounds.flatMap((round) =>
        round.questions
          .filter((q) => !q.options)
          .map((q) => ({
            quizId: quiz.id,
            quizTitle: quiz.title,
            id: q.id,
            roundTitle: round.title,
            text: q.text,
            acceptedAnswers: q.acceptedAnswers ?? [],
          })),
      ),
    );
  }

  async participants(filter: AdminAnswersQuery['filter']): Promise<AdminParticipantsResponse> {
    const questions = this.textQuestions();
    // порядок ответов участника — как вопросы в файле
    const position = new Map(questions.map((q, i) => [`${q.quizId}:${q.id}`, i]));
    const rows = await this.prisma.result.findMany({
      where: filter === 'pending' ? { textAnswers: { some: { reviewed: false } } } : undefined,
      include: { textAnswers: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      questions,
      results: rows.map((row) => ({
        id: row.id,
        quizId: row.quizId,
        nickname: row.nickname,
        source: row.source,
        score: row.score,
        total: row.total,
        durationMs: row.durationMs,
        createdAt: row.createdAt.toISOString(),
        answers: row.textAnswers
          .map(({ id, questionId, text, points, reviewed }) => ({
            id,
            questionId,
            text,
            points,
            reviewed,
          }))
          .sort(
            (a, b) =>
              (position.get(`${row.quizId}:${a.questionId}`) ?? Infinity) -
              (position.get(`${row.quizId}:${b.questionId}`) ?? Infinity),
          ),
      })),
    };
  }

  async answers(filter: AdminAnswersQuery['filter']): Promise<AdminAnswersResponse> {
    const questions = this.textQuestions();
    const rows = await this.prisma.textAnswer.findMany({
      where: filter === 'pending' ? { reviewed: false } : undefined,
      include: { result: { select: { nickname: true, quizId: true } } },
      orderBy: { id: 'asc' },
    });
    return {
      questions,
      answers: rows.map((row) => ({
        id: row.id,
        quizId: row.result.quizId,
        questionId: row.questionId,
        text: row.text,
        nickname: row.result.nickname,
        points: row.points,
        reviewed: row.reviewed,
      })),
    };
  }

  /**
   * Оценка вручную (0..2). score участника меняется на разницу со старой оценкой ответа:
   * повторный клик ничего не начисляет. Строки ответов блокируются (FOR UPDATE),
   * поэтому две одновременные оценки не посчитают одну разницу дважды.
   */
  async setVerdict(ids: number[], points: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ resultId: number; points: number }[]>`
        SELECT result_id AS "resultId", points FROM text_answers
        WHERE id = ANY(${ids}::int[])
        FOR UPDATE
      `;
      const deltas = new Map<number, number>();
      for (const row of rows) {
        deltas.set(row.resultId, (deltas.get(row.resultId) ?? 0) + points - row.points);
      }
      for (const [resultId, delta] of deltas) {
        if (delta !== 0) {
          await tx.result.update({
            where: { id: resultId },
            data: { score: { increment: delta } },
          });
        }
      }
      await tx.textAnswer.updateMany({
        where: { id: { in: ids } },
        data: { points, reviewed: true },
      });
    });
  }
}

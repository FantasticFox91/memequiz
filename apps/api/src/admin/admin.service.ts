import { Injectable } from '@nestjs/common';
import type { AdminAnswersQuery, AdminAnswersResponse } from '@memequiz/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from '../quiz/questions.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsService,
  ) {}

  async answers(filter: AdminAnswersQuery['filter']): Promise<AdminAnswersResponse> {
    // черновики тоже: локально в них могли уже ответить
    const questions = this.questions.list().flatMap((quiz) =>
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

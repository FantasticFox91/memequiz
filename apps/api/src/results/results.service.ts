import { Injectable } from '@nestjs/common';
import type { LeaderboardEntry, Participant, QuizResult } from '@memequiz/shared';
import { PrismaService } from '../prisma/prisma.service';

type ResultRow = { nickname: string; score: number; total: number; createdAt: Date };

const toQuizResult = (row: ResultRow): QuizResult => ({
  nickname: row.nickname,
  score: row.score,
  total: row.total,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Засчитывается только первая попытка.
   * ON CONFLICT DO NOTHING + RETURNING: строка вернулась — это первая запись;
   * не вернулась — участник уже есть, отдаём его первый результат.
   */
  async saveFirst(
    participant: Participant,
    score: number,
    total: number,
  ): Promise<{ result: QuizResult; isFirst: boolean }> {
    const inserted = await this.prisma.$queryRaw<ResultRow[]>`
      INSERT INTO results (source, external_id, nickname, score, total)
      VALUES (${participant.source}::"ParticipantSource", ${participant.externalId}, ${participant.nickname}, ${score}, ${total})
      ON CONFLICT (source, external_id) DO NOTHING
      RETURNING nickname, score, total, created_at AS "createdAt"
    `;
    if (inserted[0]) {
      return { result: toQuizResult(inserted[0]), isFirst: true };
    }

    const existing = await this.find(participant);
    if (!existing) {
      // конфликт был, а строки нет: могло случиться только при удалении между запросами
      throw new Error(`Result for ${participant.source}:${participant.externalId} vanished`);
    }
    return { result: existing, isFirst: false };
  }

  async find(participant: Participant): Promise<QuizResult | null> {
    const row = await this.prisma.result.findUnique({
      where: {
        source_externalId: { source: participant.source, externalId: participant.externalId },
      },
    });
    return row ? toQuizResult(row) : null;
  }

  async leaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.result.findMany({
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    });
    return rows.map((row, i) => ({ ...toQuizResult(row), rank: i + 1 }));
  }
}

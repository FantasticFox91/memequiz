import { ConflictException, Injectable } from '@nestjs/common';
import {
  type LeaderboardEntry,
  type Participant,
  type QuizResult,
  nicknameKey,
} from '@memequiz/shared';
import { PrismaService } from '../prisma/prisma.service';

type ResultRow = {
  nickname: string;
  score: number;
  total: number;
  durationMs: number | null;
  createdAt: Date;
};
type ParticipantKey = Pick<Participant, 'source' | 'externalId'>;

const toQuizResult = (row: ResultRow): QuizResult => ({
  nickname: row.nickname,
  score: row.score,
  total: row.total,
  durationMs: row.durationMs,
  createdAt: row.createdAt.toISOString(),
});

const nicknameTaken = () =>
  new ConflictException({
    message: 'Nickname taken',
    issues: [{ path: 'nickname', message: 'Этот ник уже занят, выбери другой' }],
  });

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Засчитывается только первая попытка; повторные не пишутся, возвращается первый результат.
   * На сайте ник должен быть свободен (409). Ник из Telegram не проверяется: его нельзя сменить.
   */
  async saveFirst(
    participant: Participant,
    score: number,
    total: number,
  ): Promise<{ result: QuizResult; isFirst: boolean }> {
    const key = nicknameKey(participant.nickname);
    const where = {
      source_externalId: { source: participant.source, externalId: participant.externalId },
    };

    return this.prisma.$transaction(async (tx) => {
      if (participant.source === 'web') {
        // два одновременных «Васи» на сайте: второй ждёт и увидит ник занятым
        await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${key}))`;
      }

      const existing = await tx.result.findUnique({ where });
      if (existing) return { result: toQuizResult(existing), isFirst: false };

      if (participant.source === 'web' && (await this.isNicknameTaken(key, participant, tx))) {
        throw nicknameTaken();
      }

      // время — от первой отметки старта; нет отметки (старт не дошёл) — без времени, в конце при равных баллах
      const start = await tx.quizStart.findUnique({ where });
      const durationMs = start ? Math.max(0, Date.now() - start.startedAt.getTime()) : null;

      // ON CONFLICT: тот же участник отправил дважды одновременно — вторая вставка ничего не делает
      const inserted = await tx.$queryRaw<ResultRow[]>`
        INSERT INTO results (source, external_id, nickname, nickname_key, score, total, duration_ms)
        VALUES (${participant.source}::"ParticipantSource", ${participant.externalId}, ${participant.nickname}, ${key}, ${score}, ${total}, ${durationMs})
        ON CONFLICT (source, external_id) DO NOTHING
        RETURNING nickname, score, total, duration_ms AS "durationMs", created_at AS "createdAt"
      `;
      if (inserted[0]) return { result: toQuizResult(inserted[0]), isFirst: true };

      const raced = await tx.result.findUnique({ where });
      if (!raced) {
        throw new Error(`Result for ${participant.source}:${participant.externalId} vanished`);
      }
      return { result: toQuizResult(raced), isFirst: false };
    });
  }

  /**
   * Отметка начала викторины. Пишется только первая: перезапуск или повтор «для себя»
   * таймер засчитанной попытки не сбрасывает.
   */
  async markStarted(participant: ParticipantKey): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO quiz_starts (source, external_id)
      VALUES (${participant.source}::"ParticipantSource", ${participant.externalId})
      ON CONFLICT DO NOTHING
    `;
  }

  async find(participant: ParticipantKey): Promise<QuizResult | null> {
    const row = await this.prisma.result.findUnique({
      where: {
        source_externalId: { source: participant.source, externalId: participant.externalId },
      },
    });
    return row ? toQuizResult(row) : null;
  }

  // 409, если ник на сайте уже у кого-то другого: проверяем до прохождения, а не после
  async assertNicknameFree(participant: Participant): Promise<void> {
    if (await this.isNicknameTaken(nicknameKey(participant.nickname), participant)) {
      throw nicknameTaken();
    }
  }

  private async isNicknameTaken(
    key: string,
    participant: ParticipantKey,
    db: Pick<PrismaService, 'result'> = this.prisma,
  ): Promise<boolean> {
    const other = await db.result.findFirst({
      where: {
        nicknameKey: key,
        NOT: { source: participant.source, externalId: participant.externalId },
      },
      select: { id: true },
    });
    return !!other;
  }

  async leaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.result.findMany({
      // при равных баллах выше тот, кто быстрее, затем тот, кто раньше
      orderBy: [
        { score: 'desc' },
        { durationMs: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
    return rows.map((row, i) => ({ ...toQuizResult(row), rank: i + 1 }));
  }
}

import { ConflictException, Injectable } from '@nestjs/common';
import {
  type LeaderboardEntry,
  type Participant,
  type QuizResult,
  nicknameKey,
} from '@memequiz/shared';
import { PrismaService } from '../prisma/prisma.service';

// текстовый ответ засчитанной попытки; points — оценка автопроверки, уже учтена в score
export type TextAnswer = { questionId: string; text: string; points: number };

type ResultRow = {
  quizId: string;
  nickname: string;
  score: number;
  total: number;
  durationMs: number | null;
  createdAt: Date;
};
type ParticipantKey = Pick<Participant, 'source' | 'externalId'>;

// pending — у результата есть непроверенные текстовые ответы: баллы не показываем
const toQuizResult = (row: ResultRow, pending: boolean): QuizResult => ({
  quizId: row.quizId,
  nickname: row.nickname,
  score: pending ? null : row.score,
  pending,
  total: row.total,
  durationMs: row.durationMs,
  createdAt: row.createdAt.toISOString(),
});

const nicknameTaken = () =>
  new ConflictException({
    message: 'Nickname taken',
    issues: [{ path: 'nickname', message: 'Этот ник уже занят, выбери другой' }],
  });

const participantWhere = (participant: ParticipantKey) => ({
  source: participant.source,
  externalId: participant.externalId,
});

// число непроверенных текстовых ответов к результату
const pendingCount = {
  _count: { select: { textAnswers: { where: { reviewed: false } } } },
} as const;
const isPending = (row: { _count: { textAnswers: number } }) => row._count.textAnswers > 0;

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Засчитывается только первая попытка в каждой викторине; повторные не пишутся, возвращается первый результат.
   * На сайте ник должен быть свободен (409). Ник из Telegram не проверяется: его нельзя сменить.
   * После первого засчитанного результата ник участника не меняется: в других викторинах пишется он же.
   */
  async saveFirst(
    participant: Participant,
    quizId: string,
    score: number,
    total: number,
    textAnswers: readonly TextAnswer[] = [],
  ): Promise<{ result: QuizResult; isFirst: boolean }> {
    const key = nicknameKey(participant.nickname);
    const where = { source_externalId_quizId: { ...participantWhere(participant), quizId } };

    return this.prisma.$transaction(async (tx) => {
      if (participant.source === 'web') {
        // два одновременных «Васи» на сайте: второй ждёт и увидит ник занятым
        await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${key}))`;
      }

      const existing = await tx.result.findUnique({ where, include: pendingCount });
      if (existing) return { result: toQuizResult(existing, isPending(existing)), isFirst: false };

      const previous = await tx.result.findFirst({
        where: participantWhere(participant),
        orderBy: { createdAt: 'asc' },
        select: { nickname: true, nicknameKey: true },
      });
      const nickname = previous?.nickname ?? participant.nickname;
      const savedKey = previous?.nicknameKey ?? key;

      if (
        !previous &&
        participant.source === 'web' &&
        (await this.isNicknameTaken(key, participant, tx))
      ) {
        throw nicknameTaken();
      }

      // время — от первой отметки старта; нет отметки (старт не дошёл) — без времени, в конце при равных баллах
      const start = await tx.quizStart.findUnique({ where });
      const durationMs = start ? Math.max(0, Date.now() - start.startedAt.getTime()) : null;

      // ON CONFLICT: тот же участник отправил дважды одновременно — вторая вставка ничего не делает
      const inserted = await tx.$queryRaw<(ResultRow & { id: number })[]>`
        INSERT INTO results (source, external_id, quiz_id, nickname, nickname_key, score, total, duration_ms)
        VALUES (${participant.source}::"ParticipantSource", ${participant.externalId}, ${quizId}, ${nickname}, ${savedKey}, ${score}, ${total}, ${durationMs})
        ON CONFLICT (source, external_id, quiz_id) DO NOTHING
        RETURNING id, quiz_id AS "quizId", nickname, score, total, duration_ms AS "durationMs", created_at AS "createdAt"
      `;
      if (inserted[0]) {
        if (textAnswers.length > 0) {
          await tx.textAnswer.createMany({
            data: textAnswers.map((a) => ({ ...a, resultId: inserted[0].id })),
          });
        }
        return { result: toQuizResult(inserted[0], textAnswers.length > 0), isFirst: true };
      }

      const raced = await tx.result.findUnique({ where, include: pendingCount });
      if (!raced) {
        throw new Error(
          `Result for ${participant.source}:${participant.externalId} in ${quizId} vanished`,
        );
      }
      return { result: toQuizResult(raced, isPending(raced)), isFirst: false };
    });
  }

  /**
   * Отметка начала викторины. Пишется только первая: перезапуск или повтор «для себя»
   * таймер засчитанной попытки не сбрасывает.
   */
  async markStarted(participant: ParticipantKey, quizId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO quiz_starts (source, external_id, quiz_id)
      VALUES (${participant.source}::"ParticipantSource", ${participant.externalId}, ${quizId})
      ON CONFLICT DO NOTHING
    `;
  }

  // засчитанные результаты участника по всем викторинам; nickname — ник первого из них
  async findAll(
    participant: ParticipantKey,
  ): Promise<{ nickname: string | null; results: Record<string, QuizResult> }> {
    const rows = await this.prisma.result.findMany({
      where: participantWhere(participant),
      orderBy: { createdAt: 'asc' },
      include: pendingCount,
    });
    return {
      nickname: rows[0]?.nickname ?? null,
      results: Object.fromEntries(
        rows.map((row) => [row.quizId, toQuizResult(row, isPending(row))]),
      ),
    };
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
      where: { nicknameKey: key, NOT: participantWhere(participant) },
      select: { id: true },
    });
    return !!other;
  }

  // викторины, в которых есть хотя бы один результат
  async quizIds(): Promise<string[]> {
    const rows = await this.prisma.result.findMany({ distinct: ['quizId'], select: { quizId: true } });
    return rows.map((r) => r.quizId);
  }

  async leaderboard(quizId: string, limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.result.findMany({
      // результаты с непроверенными текстовыми ответами появятся после проверки
      where: { quizId, textAnswers: { none: { reviewed: false } } },
      // при равных баллах выше тот, кто быстрее, затем тот, кто раньше
      orderBy: [
        { score: 'desc' },
        { durationMs: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
    return rows.map((row, i) => ({ ...toQuizResult(row, false), rank: i + 1 }));
  }
}

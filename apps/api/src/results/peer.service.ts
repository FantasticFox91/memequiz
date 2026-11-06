import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type LeaderboardEntry,
  type QuizResult,
  peerLeaderboardsResponseSchema,
} from '@memequiz/shared';
import type { Env } from '../config/env';

const PULL_INTERVAL_MS = 60_000;
const PULL_TIMEOUT_MS = 10_000;

type Snapshot = { server: string; quizzes: Record<string, QuizResult[]> };

// порядок лидерборда: баллы по убыванию, при равных — кто быстрее (без времени — в конце), затем кто раньше
function compareEntries(a: QuizResult, b: QuizResult): number {
  return (
    (b.score ?? 0) - (a.score ?? 0) ||
    (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity) ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

/**
 * Общий лидерборд двух серверов (например, второй — для России). У каждого сервера своя БД,
 * свои участники и своя админка; раз в минуту сервер забирает с PEER_URL его проверенные
 * результаты (GET /api/peer/leaderboards) и подмешивает их в свой лидерборд.
 * Последний полученный снимок держится в памяти: второй сервер недоступен — показываем его старые данные.
 */
@Injectable()
export class PeerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PeerService.name);
  readonly serverId: string;
  private readonly peerUrl: string | undefined;
  private snapshot: Snapshot | null = null;
  private timer: NodeJS.Timeout | undefined;
  // пишем в лог только смену состояния, а не каждую неудачную минуту
  private failing = false;

  constructor(config: ConfigService<Env, true>) {
    this.serverId = config.get('SERVER_ID', { infer: true });
    this.peerUrl = config.get('PEER_URL', { infer: true })?.replace(/\/+$/, '');
  }

  onModuleInit() {
    if (!this.peerUrl) return;
    this.logger.log(`Shared leaderboard with ${this.peerUrl}`);
    void this.pull();
    this.timer = setInterval(() => void this.pull(), PULL_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Свои записи + записи второго сервера, места пересчитаны по общему списку. */
  merge(quizId: string, local: readonly LeaderboardEntry[], limit: number): LeaderboardEntry[] {
    const own = local.map((e) => ({ ...e, server: this.serverId, own: true }));
    const snapshot = this.snapshot;
    const remote = snapshot?.quizzes[quizId] ?? [];
    if (!snapshot || remote.length === 0) return own;
    return [...own, ...remote.map((e) => ({ ...e, rank: 1, server: snapshot.server, own: false }))]
      .sort(compareEntries)
      .slice(0, limit)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }

  private async pull() {
    try {
      const res = await fetch(`${this.peerUrl}/api/peer/leaderboards`, {
        signal: AbortSignal.timeout(PULL_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = peerLeaderboardsResponseSchema.parse(await res.json());
      if (data.server === this.serverId) {
        throw new Error(`peer has the same SERVER_ID "${data.server}": set different ones`);
      }
      // в общий лидерборд — только проверенные результаты, даже если пир прислал лишнее
      const quizzes = Object.fromEntries(
        Object.entries(data.quizzes).map(([id, rows]) => [id, rows.filter((r) => !r.pending)]),
      );
      this.snapshot = { server: data.server, quizzes };
      if (this.failing) this.logger.log(`Peer ${this.peerUrl} is reachable again`);
      this.failing = false;
    } catch (e) {
      if (!this.failing) {
        this.logger.warn(`Cannot pull leaderboard from ${this.peerUrl}: ${(e as Error).message}`);
      }
      this.failing = true;
    }
  }
}

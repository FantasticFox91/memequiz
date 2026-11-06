import { Controller, Get } from '@nestjs/common';
import { PEER_LEADERBOARD_LIMIT, type PeerLeaderboardsResponse } from '@memequiz/shared';
import { PeerService } from './peer.service';
import { ResultsService } from './results.service';

@Controller('peer')
export class PeerController {
  constructor(
    private readonly results: ResultsService,
    private readonly peer: PeerService,
  ) {}

  // только свои результаты: иначе серверы пересылали бы друг другу чужие записи по кругу.
  // Секрет не нужен — это те же данные, что в публичном лидерборде
  @Get('leaderboards')
  async leaderboards(): Promise<PeerLeaderboardsResponse> {
    const quizIds = await this.results.quizIds();
    const boards = await Promise.all(
      quizIds.map(async (id) => [id, await this.results.leaderboard(id, PEER_LEADERBOARD_LIMIT)]),
    );
    return { server: this.peer.serverId, quizzes: Object.fromEntries(boards) };
  }
}

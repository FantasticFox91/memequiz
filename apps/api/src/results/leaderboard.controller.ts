import { Controller, Get, Query } from '@nestjs/common';
import { type LeaderboardResponse, leaderboardQuerySchema } from '@memequiz/shared';
import { createZodDto } from '../common/zod-validation.pipe';
import { PeerService } from './peer.service';
import { ResultsService } from './results.service';

class LeaderboardQueryDto extends createZodDto(leaderboardQuerySchema) {}

@Controller('leaderboard')
export class LeaderboardController {
  constructor(
    private readonly results: ResultsService,
    private readonly peer: PeerService,
  ) {}

  // свои результаты вместе с результатами второго сервера (если задан PEER_URL)
  @Get()
  async leaderboard(@Query() query: LeaderboardQueryDto): Promise<LeaderboardResponse> {
    const local = await this.results.leaderboard(query.quiz, query.limit);
    return this.peer.merge(query.quiz, local, query.limit);
  }
}

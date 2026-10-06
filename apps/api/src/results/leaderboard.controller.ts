import { Controller, Get, Query } from '@nestjs/common';
import { type LeaderboardResponse, leaderboardQuerySchema } from '@memequiz/shared';
import { createZodDto } from '../common/zod-validation.pipe';
import { ResultsService } from './results.service';

class LeaderboardQueryDto extends createZodDto(leaderboardQuerySchema) {}

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly results: ResultsService) {}

  @Get()
  leaderboard(@Query() query: LeaderboardQueryDto): Promise<LeaderboardResponse> {
    return this.results.leaderboard(query.limit);
  }
}

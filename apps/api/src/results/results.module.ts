import { Module } from '@nestjs/common';
import { LeaderboardController } from './leaderboard.controller';
import { MeController } from './me.controller';
import { ResultsService } from './results.service';

@Module({
  controllers: [MeController, LeaderboardController],
  providers: [ResultsService],
  exports: [ResultsService],
})
export class ResultsModule {}

import { Module } from '@nestjs/common';
import { LeaderboardController } from './leaderboard.controller';
import { MeController } from './me.controller';
import { PeerController } from './peer.controller';
import { PeerService } from './peer.service';
import { ResultsService } from './results.service';

@Module({
  controllers: [MeController, LeaderboardController, PeerController],
  providers: [ResultsService, PeerService],
  exports: [ResultsService],
})
export class ResultsModule {}

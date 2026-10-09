import { Module } from '@nestjs/common';
import { QuizModule } from '../quiz/quiz.module';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [QuizModule],
  controllers: [BotController],
  providers: [BotService],
})
export class BotModule {}

import { Module } from '@nestjs/common';
import { QuizModule } from '../quiz/quiz.module';
import { BotService } from './bot.service';

@Module({
  imports: [QuizModule],
  providers: [BotService],
})
export class BotModule {}

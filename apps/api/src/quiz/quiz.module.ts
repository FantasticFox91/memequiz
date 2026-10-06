import { Module } from '@nestjs/common';
import { ResultsModule } from '../results/results.module';
import { QuestionsService } from './questions.service';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

@Module({
  imports: [ResultsModule],
  controllers: [QuizController],
  providers: [QuestionsService, QuizService],
  exports: [QuestionsService],
})
export class QuizModule {}

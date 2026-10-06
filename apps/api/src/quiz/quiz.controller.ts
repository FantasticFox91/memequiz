import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  type Participant,
  type QuizResponse,
  type SubmitResponse,
  submitRequestSchema,
} from '@memequiz/shared';
import { createZodDto } from '../common/zod-validation.pipe';
import { CurrentParticipant } from '../participant/current-participant.decorator';
import { ResultsService } from '../results/results.service';
import { QuizService } from './quiz.service';

class SubmitRequestDto extends createZodDto(submitRequestSchema) {}

@Controller('quiz')
export class QuizController {
  constructor(
    private readonly quiz: QuizService,
    private readonly results: ResultsService,
  ) {}

  @Get()
  getQuiz(): QuizResponse {
    return this.quiz.getPublicRounds();
  }

  // 200 и для первой, и для повторной отправки: различаются по isFirst
  @Post('submit')
  @HttpCode(200)
  submit(
    @Body() body: SubmitRequestDto,
    @CurrentParticipant() participant: Participant,
  ): Promise<SubmitResponse> {
    const { score, total } = this.quiz.score(body.answers);
    return this.results.saveFirst(participant, score, total);
  }
}

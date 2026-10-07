import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { type QuizResponse, type SubmitResponse, submitRequestSchema } from '@memequiz/shared';
import { createZodDto } from '../common/zod-validation.pipe';
import { CurrentParticipant } from '../participant/current-participant.decorator';
import { type ParticipantIdentity, withNickname } from '../participant/participant.resolver';
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

  // отметка начала: от неё сервер считает время засчитанной попытки
  @Post('start')
  @HttpCode(204)
  async start(@CurrentParticipant() identity: ParticipantIdentity): Promise<void> {
    await this.results.markStarted(identity);
  }

  // 200 и для первой, и для повторной отправки: различаются по isFirst.
  // Повторная попытка «для себя»: баллы считаются и возвращаются в attempt, но не сохраняются
  @Post('submit')
  @HttpCode(200)
  async submit(
    @Body() body: SubmitRequestDto,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<SubmitResponse> {
    const participant = withNickname(identity, body.nickname);
    const attempt = this.quiz.score(body.answers);
    const { result, isFirst } = await this.results.saveFirst(
      participant,
      attempt.score,
      attempt.total,
    );
    return { result, attempt, isFirst };
  }
}

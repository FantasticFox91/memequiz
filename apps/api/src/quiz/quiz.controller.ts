import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type QuizResponse,
  type QuizzesResponse,
  type SubmitResponse,
  submitRequestSchema,
} from '@memequiz/shared';
import { Throttle } from '@nestjs/throttler';
import { SUBMIT_LIMITS } from '../common/throttling';
import { createZodDto } from '../common/zod-validation.pipe';
import { CurrentParticipant } from '../participant/current-participant.decorator';
import { type ParticipantIdentity, withNickname } from '../participant/participant.resolver';
import { ResultsService } from '../results/results.service';
import { QuizService } from './quiz.service';

class SubmitRequestDto extends createZodDto(submitRequestSchema) {}

@Controller()
export class QuizController {
  constructor(
    private readonly quiz: QuizService,
    private readonly results: ResultsService,
  ) {}

  @Get('quizzes')
  list(): QuizzesResponse {
    return this.quiz.list();
  }

  // вопросы участника: в раундах с pick у каждого свой набор
  @Get('quiz/:quizId')
  getQuiz(
    @Param('quizId') quizId: string,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): QuizResponse {
    return this.quiz.getPublicRounds(this.quiz.roundsFor(this.quiz.getQuiz(quizId), identity));
  }

  // отметка начала: от неё сервер считает время засчитанной попытки
  @Post('quiz/:quizId/start')
  @HttpCode(204)
  async start(
    @Param('quizId') quizId: string,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<void> {
    await this.results.markStarted(identity, this.quiz.getQuiz(quizId).id);
  }

  // 200 и для первой, и для повторной отправки: различаются по isFirst.
  // Повторная попытка «для себя»: баллы считаются и возвращаются в attempt, но не сохраняются
  @Post('quiz/:quizId/submit')
  @HttpCode(200)
  @Throttle(SUBMIT_LIMITS)
  async submit(
    @Param('quizId') quizId: string,
    @Body() body: SubmitRequestDto,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<SubmitResponse> {
    const quiz = this.quiz.getQuiz(quizId);
    const participant = withNickname(identity, body.nickname);
    const { textAnswers, ...attempt } = this.quiz.score(
      this.quiz.roundsFor(quiz, identity),
      body.answers,
    );
    const { result, isFirst } = await this.results.saveFirst(
      participant,
      quiz.id,
      attempt.score,
      attempt.total,
      textAnswers,
    );
    // засчитанная попытка с текстовыми ответами: баллы покажем после проверки
    if (isFirst && result.pending) return { result, attempt: { ...attempt, score: null }, isFirst };
    return { result, attempt, isFirst };
  }
}

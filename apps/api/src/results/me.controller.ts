import { Controller, Get, Query } from '@nestjs/common';
import { type StatusResponse, statusQuerySchema } from '@memequiz/shared';
import { Throttle } from '@nestjs/throttler';
import { STATUS_LIMITS } from '../common/throttling';
import { createZodDto } from '../common/zod-validation.pipe';
import { CurrentParticipant } from '../participant/current-participant.decorator';
import { type ParticipantIdentity, withNickname } from '../participant/participant.resolver';
import { ResultsService } from './results.service';

class StatusQueryDto extends createZodDto(statusQuerySchema) {}

@Controller('me')
export class MeController {
  constructor(private readonly results: ResultsService) {}

  // участник — кука или initData; ?nickname=... на сайте — заодно проверить, свободен ли ник (409)
  @Get('status')
  @Throttle(STATUS_LIMITS)
  async status(
    @CurrentParticipant() identity: ParticipantIdentity,
    @Query() query: StatusQueryDto,
  ): Promise<StatusResponse> {
    const result = await this.results.find(identity);
    if (result) return { completed: true, result };

    if (identity.source === 'web' && query.nickname) {
      await this.results.assertNicknameFree(withNickname(identity, query.nickname));
    }
    return { completed: false };
  }
}

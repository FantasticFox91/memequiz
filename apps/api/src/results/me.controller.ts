import { Controller, Get } from '@nestjs/common';
import type { Participant, StatusResponse } from '@memequiz/shared';
import { CurrentParticipant } from '../participant/current-participant.decorator';
import { ResultsService } from './results.service';

@Controller('me')
export class MeController {
  constructor(private readonly results: ResultsService) {}

  // ник приходит в query: ?nickname=...
  @Get('status')
  async status(@CurrentParticipant() participant: Participant): Promise<StatusResponse> {
    const result = await this.results.find(participant);
    return result ? { completed: true, result } : { completed: false };
  }
}

import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Participant } from '@memequiz/shared';
import type { Request } from 'express';
import { resolveParticipant } from './participant.resolver';

// контроллеры получают участника отсюда и не знают, откуда он взялся (web-ник или Telegram)
export const CurrentParticipant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Participant =>
    resolveParticipant(ctx.switchToHttp().getRequest<Request>()),
);

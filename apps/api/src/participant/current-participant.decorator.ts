import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Response } from 'express';
import { type ParticipantIdentity, resolveIdentity } from './participant.resolver';
import type { TelegramRequest } from './telegram-auth.guard';

// контроллеры получают участника отсюда и не знают, откуда он взялся (кука сайта или Telegram)
export const CurrentParticipant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ParticipantIdentity => {
    const http = ctx.switchToHttp();
    return resolveIdentity(http.getRequest<TelegramRequest>(), http.getResponse<Response>());
  },
);

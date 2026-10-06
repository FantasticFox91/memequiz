import { BadRequestException } from '@nestjs/common';
import { type Participant, nicknameSchema, nicknameToExternalId } from '@memequiz/shared';
import type { Request } from 'express';

/**
 * Единственное место, где решается, кто прислал запрос.
 * Сейчас только web: ник из тела (POST) или query (GET).
 * Этап 7: сначала проверить Telegram initData и вернуть { source: 'tg', ... }.
 */
export function resolveParticipant(req: Request): Participant {
  const raw: unknown =
    (req.body as { nickname?: unknown } | undefined)?.nickname ?? req.query.nickname;

  const result = nicknameSchema.safeParse(raw);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      issues: result.error.issues.map((i) => ({ path: 'nickname', message: i.message })),
    });
  }

  return {
    source: 'web',
    externalId: nicknameToExternalId(result.data),
    nickname: result.data,
  };
}

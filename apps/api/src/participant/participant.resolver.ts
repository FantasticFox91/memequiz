import { BadRequestException } from '@nestjs/common';
import {
  type Participant,
  type ParticipantSource,
  nicknameSchema,
  telegramNickname,
} from '@memequiz/shared';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { TelegramRequest } from './telegram-auth.guard';

/** Кто прислал запрос. nickname задан, только если его нельзя выбрать (Telegram). */
export type ParticipantIdentity = {
  source: ParticipantSource;
  externalId: string;
  fixedNickname?: string;
};

// анонимный id браузера: по нему засчитывается первый результат на сайте
export const WEB_ID_COOKIE = 'mq_pid';
const WEB_ID_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000; // максимум, который принимает Chrome
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Единственное место, где решается, кто прислал запрос.
 * - tg: initData уже проверен TelegramAuthGuard, участник — user.id, ник из профиля и не меняется;
 * - web: участник — кука mq_pid (выдаётся при первом запросе), ник выбирает сам.
 */
export function resolveIdentity(req: TelegramRequest, res: Response): ParticipantIdentity {
  const tgUser = req.telegramUser;
  if (tgUser) {
    return { source: 'tg', externalId: String(tgUser.id), fixedNickname: telegramNickname(tgUser) };
  }
  return { source: 'web', externalId: getOrIssueWebId(req, res) };
}

function readCookie(req: TelegramRequest, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function getOrIssueWebId(req: TelegramRequest, res: Response): string {
  const existing = readCookie(req, WEB_ID_COOKIE);
  if (existing && UUID_RE.test(existing)) return existing;

  const id = randomUUID();
  res.cookie(WEB_ID_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    // локально api по http
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
    maxAge: WEB_ID_MAX_AGE_MS,
  });
  return id;
}

/**
 * Участник с ником для записи результата. В Telegram ник из профиля, присланный игнорируется;
 * на сайте ник обязателен.
 */
export function withNickname(identity: ParticipantIdentity, nickname: unknown): Participant {
  const { source, externalId, fixedNickname } = identity;
  if (fixedNickname) return { source, externalId, nickname: fixedNickname };

  const result = nicknameSchema.safeParse(nickname);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      issues: result.error.issues.map((i) => ({ path: 'nickname', message: i.message })),
    });
  }
  return { source, externalId, nickname: result.data };
}

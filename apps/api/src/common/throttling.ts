import type { ThrottlerOptions } from '@nestjs/throttler';
import { WEB_ID_COOKIE, readCookie } from '../participant/participant.resolver';
import type { TelegramRequest } from '../participant/telegram-auth.guard';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Два независимых лимита, запрос должен пройти оба:
 * - participant: по участнику (Telegram user.id или кука сайта, без куки — IP). Строгий: один человек
 *   не может заспамить submit, а компания на одном Wi-Fi не мешает друг другу;
 * - ip: по IP, мягкий. Не даёт обойти первый лимит, придумывая новую куку на каждый запрос.
 * TelegramAuthGuard должен стоять раньше: от него request.telegramUser.
 */
export const THROTTLERS: ThrottlerOptions[] = [
  {
    name: 'participant',
    ttl: MINUTE,
    limit: 60,
    getTracker: (req) => participantTracker(req as TelegramRequest),
  },
  { name: 'ip', ttl: MINUTE, limit: 300 },
];

// лимиты отдельных эндпоинтов (@Throttle); не указанные здесь берутся из THROTTLERS
// по IP — в час: новые куки (= новые участники сайта) не дадут залить лидерборд сотнями фейковых
// результатов, а компании на одном Wi-Fi 100 отправок в час хватит с запасом, включая повторы «для себя»
export const SUBMIT_LIMITS = {
  participant: { ttl: MINUTE, limit: 5 },
  ip: { ttl: HOUR, limit: 100 },
};

export const STATUS_LIMITS = {
  participant: { ttl: MINUTE, limit: 30 },
  ip: { ttl: MINUTE, limit: 120 },
};

function participantTracker(req: TelegramRequest): string {
  if (req.telegramUser) return `tg:${req.telegramUser.id}`;
  const webId = readCookie(req, WEB_ID_COOKIE);
  return webId ? `web:${webId}` : `ip:${req.ip}`;
}

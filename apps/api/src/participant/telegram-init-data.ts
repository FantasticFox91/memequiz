import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Проверка Telegram Mini App initData:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

export type TelegramInitUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export class InitDataError extends Error {}

// часы клиента и сервера могут немного расходиться
const CLOCK_SKEW_SEC = 300;

function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec: number,
  nowMs = Date.now(),
): TelegramInitUser {
  const params = new URLSearchParams(initData);

  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new InitDataError('hash missing or malformed');
  params.delete('hash');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = Buffer.from(hash, 'hex');
  const matches = (p: URLSearchParams) =>
    timingSafeEqual(createHmac('sha256', secret).update(dataCheckString(p)).digest(), expected);

  // signature (Ed25519 для сторонних проверяющих) по документации входит в data_check_string,
  // но часть клиентов считает hash без неё — принимаем оба варианта, оба требуют токен бота
  let valid = matches(params);
  if (!valid && params.has('signature')) {
    const withoutSignature = new URLSearchParams(params);
    withoutSignature.delete('signature');
    valid = matches(withoutSignature);
  }
  if (!valid) throw new InitDataError('hash mismatch');

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) throw new InitDataError('auth_date invalid');
  const ageSec = nowMs / 1000 - authDate;
  if (ageSec > maxAgeSec) throw new InitDataError('initData expired');
  if (ageSec < -CLOCK_SKEW_SEC) throw new InitDataError('auth_date in the future');

  let user: unknown;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    throw new InitDataError('user is not JSON');
  }
  const id = (user as { id?: unknown } | null)?.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new InitDataError('user.id missing');
  }
  return user as TelegramInitUser;
}

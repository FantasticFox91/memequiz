// Подписанный initData для ручной проверки api без Telegram (этап 7).
//   TELEGRAM_BOT_TOKEN=... node scripts/tg-init-data.mjs [user_id] [age_sec]
// Печатает заголовок для curl:
//   curl -H "$(TELEGRAM_BOT_TOKEN=... node scripts/tg-init-data.mjs 42)" https://<host>/api/me/status
// age_sec > TG_INIT_DATA_TTL даёт просроченный initData (401).
import { createHmac } from 'node:crypto';

export function signInitData(botToken, user, authDate) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'test',
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
}

// запуск как скрипта, а не импорт
if (process.argv[1]?.endsWith('tg-init-data.mjs')) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is required');
    process.exit(1);
  }
  const id = Number(process.argv[2] ?? 42);
  const age = Number(process.argv[3] ?? 0);
  const initData = signInitData(
    token,
    { id, first_name: 'Test', username: `test_${id}` },
    Math.floor(Date.now() / 1000) - age,
  );
  console.log(`Authorization: tma ${initData}`);
}

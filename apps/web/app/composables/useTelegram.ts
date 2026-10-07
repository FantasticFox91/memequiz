/**
 * Telegram Mini App. initData читаем сами из hash стартового URL (#tgWebAppData=...), а не из SDK:
 * так api-авторизация работает, даже если telegram-web-app.js не загрузился.
 * Hash теряется при навигации, поэтому initData запоминается в sessionStorage.
 *
 * user здесь НЕ проверен и нужен только для UI; сервер проверяет подпись initData сам.
 * webApp — SDK (кнопки, тема, haptics); null вне Telegram или если скрипт не загрузился.
 */

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

const INIT_DATA_KEY = 'memequiz:tg-init-data';

let cachedInitData: string | null | undefined;

function readInitData(): string | null {
  if (cachedInitData !== undefined) return cachedInitData;

  let initData: string | null = null;
  try {
    initData = new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData');
    if (initData) sessionStorage.setItem(INIT_DATA_KEY, initData);
    else initData = sessionStorage.getItem(INIT_DATA_KEY);
  } catch {
    // нет sessionStorage: работаем с тем, что было в hash
  }

  cachedInitData = initData || null;
  return cachedInitData;
}

function parseUser(initData: string | null): TelegramUser | null {
  if (!initData) return null;
  try {
    const user = JSON.parse(
      new URLSearchParams(initData).get('user') ?? 'null',
    ) as TelegramUser | null;
    return user && typeof user.id === 'number' ? user : null;
  } catch {
    return null;
  }
}

export function useTelegram() {
  const initData = readInitData();
  const user = parseUser(initData);
  const webApp = (initData && window.Telegram?.WebApp) || null;

  // старые клиенты (Desktop, Web) могут не знать новых методов
  const supports = (version: string) => !!webApp?.isVersionAtLeast(version);

  return {
    isTelegram: !!initData,
    initData,
    user,
    webApp,
    supports,
  };
}

/**
 * Единая точка запросов к api. В Telegram к каждому запросу добавляется initData:
 * по нему сервер проверяет подпись и узнаёт участника (Telegram user.id).
 */
export function useApi() {
  const { apiBase } = useRuntimeConfig().public;
  const { initData } = useTelegram();
  return $fetch.create({
    baseURL: apiBase,
    headers: initData ? { Authorization: `tma ${initData}` } : undefined,
  });
}

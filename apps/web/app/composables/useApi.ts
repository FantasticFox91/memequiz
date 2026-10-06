/**
 * Единая точка запросов к api. На этапе 7 сюда добавится заголовок с Telegram initData.
 */
export function useApi() {
  const { apiBase } = useRuntimeConfig().public;
  return $fetch.create({ baseURL: apiBase });
}

type ApiErrorBody = { message?: unknown; issues?: { message: string }[] };

// текст для пользователя: сообщения валидации api или общая фраза про сеть
export function apiErrorMessage(e: unknown): string {
  const data = (e as { data?: ApiErrorBody } | null)?.data;
  if (data?.issues?.length) return data.issues.map((i) => i.message).join('. ');
  const status = (e as { status?: number } | null)?.status;
  // подпись Telegram не прошла или устарела: поможет только новый запуск из бота
  if (status === 401) return 'Сессия Telegram устарела, закройте и снова откройте приложение';
  if (status === 429) return 'Слишком много попыток, подождите минуту и попробуйте снова';
  if (status && status >= 500) return 'Сервер не отвечает, попробуйте ещё раз';
  return 'Нет связи с сервером, проверьте интернет';
}

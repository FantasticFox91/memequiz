type ApiErrorBody = { message?: unknown; issues?: { message: string }[] };

// текст для пользователя: сообщения валидации api или общая фраза про сеть
export function apiErrorMessage(e: unknown): string {
  const data = (e as { data?: ApiErrorBody } | null)?.data;
  if (data?.issues?.length) return data.issues.map((i) => i.message).join('. ');
  const status = (e as { status?: number } | null)?.status;
  if (status && status >= 500) return 'Сервер не отвечает, попробуйте ещё раз';
  return 'Нет связи с сервером, проверьте интернет';
}

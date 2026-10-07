export type MainButtonState = {
  text: string;
  enabled?: boolean;
  loading?: boolean;
};

/**
 * В Telegram главное действие страницы — нативная MainButton вместо своей кнопки.
 * state() === null прячет кнопку. Возвращает true, если MainButton используется:
 * тогда страница свою кнопку не рисует.
 */
export function useTelegramMainButton(
  state: () => MainButtonState | null,
  onClick: () => void,
): boolean {
  const { webApp } = useTelegram();
  if (!webApp) return false;
  const button = webApp.MainButton;
  const handler = () => onClick();

  // всё в onMounted: NuxtPage в Suspense, новая страница монтируется после того,
  // как старая спрятала свою кнопку в onBeforeUnmount
  let stop: (() => void) | undefined;
  onMounted(() => {
    button.onClick(handler);
    stop = watchEffect(() => {
      const s = state();
      if (!s) {
        button.hideProgress().hide();
        return;
      }
      button.setParams({ text: s.text, is_active: s.enabled !== false, is_visible: true });
      if (s.loading) button.showProgress(false);
      else button.hideProgress();
    });
  });
  onBeforeUnmount(() => {
    stop?.();
    button.offClick(handler);
    button.hideProgress().hide();
  });

  return true;
}

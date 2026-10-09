/**
 * Вибрация: в Telegram — HapticFeedback (с 6.1), в браузере — navigator.vibrate
 * (Android; iOS Safari его не поддерживает, там просто тишина). Все вызовы безопасны без поддержки.
 */
type Impact = 'light' | 'medium' | 'heavy';
type Notification = 'success' | 'warning' | 'error';

// паттерны для navigator.vibrate, мс: короткие, чтобы не раздражать
const WEB_IMPACT: Record<Impact, number> = { light: 8, medium: 15, heavy: 25 };
const WEB_NOTIFICATION: Record<Notification, number[]> = {
  success: [12, 60, 24],
  warning: [20, 80, 20],
  error: [30, 60, 30, 60, 30],
};

export function useHaptics() {
  const telegram = useTelegram();
  const tg = telegram.supports('6.1') ? telegram.webApp?.HapticFeedback : undefined;

  function vibrate(pattern: number | number[]) {
    // в Telegram без HapticFeedback (старый Desktop) не дёргаем и vibrate
    if (telegram.isTelegram) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // vibrate может бросить в iframe без разрешения
    }
  }

  return {
    // смена выбора: самый лёгкий отклик
    selection() {
      if (tg) tg.selectionChanged();
      else vibrate(WEB_IMPACT.light);
    },
    impact(style: Impact = 'light') {
      if (tg) tg.impactOccurred(style);
      else vibrate(WEB_IMPACT[style]);
    },
    notify(type: Notification) {
      if (tg) tg.notificationOccurred(type);
      else vibrate(WEB_NOTIFICATION[type]);
    },
  };
}

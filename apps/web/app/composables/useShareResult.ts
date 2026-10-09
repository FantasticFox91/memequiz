import type { BotInfoResponse } from '@memequiz/shared';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * «Поделиться результатом».
 * - Telegram: выбор чата (t.me/share/url) со ссылкой на Mini App бота, чтобы друг открыл викторину в Telegram;
 * - браузер: системное меню (Web Share API, в основном телефоны), иначе текст со ссылкой в буфер обмена.
 */
export function useShareResult() {
  const telegram = useTelegram();
  // username бота: грузим заранее, а не по нажатию, чтобы шаринг не ждал сети
  const botUsername = ref<string | null>(null);

  onMounted(async () => {
    if (!telegram.isTelegram) return;
    try {
      botUsername.value = (await useApi()<BotInfoResponse>('/bot')).username;
    } catch {
      // без username поделимся ссылкой на сайт
    }
  });

  function link(): string {
    if (telegram.isTelegram && botUsername.value) {
      return `https://t.me/${botUsername.value}?startapp`;
    }
    return window.location.origin;
  }

  async function share(text: string): Promise<ShareOutcome> {
    const url = link();

    if (telegram.webApp) {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
      telegram.webApp.openTelegramLink(shareUrl);
      return 'shared';
    }

    const data: ShareData = { title: 'MemeQuiz', text, url };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return 'shared';
      } catch (e) {
        // пользователь закрыл меню — это не ошибка
        if ((e as DOMException).name === 'AbortError') return 'cancelled';
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return { share };
}

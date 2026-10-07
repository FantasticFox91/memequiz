import { nicknameKey as toNicknameKey } from '@memequiz/shared';
import { defineStore } from 'pinia';

const NICKNAME_KEY = 'memequiz:nickname';

/**
 * Ник для показа и отправки. Участника определяет сервер (кука на сайте, user.id в Telegram),
 * здесь ник только запоминается между заходами.
 */
export const useParticipantStore = defineStore('participant', () => {
  const nickname = ref(readStorage<string>(NICKNAME_KEY) ?? '');

  // «Вася» и «вася» — один ник: по ключу ищем себя в лидерборде и привязываем прогресс
  const nicknameKey = computed(() => (nickname.value ? toNicknameKey(nickname.value) : ''));

  function setNickname(value: string) {
    nickname.value = value;
    writeStorage(NICKNAME_KEY, value);
  }

  return { nickname, nicknameKey, setNickname };
});

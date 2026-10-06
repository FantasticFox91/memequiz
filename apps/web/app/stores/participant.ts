import { nicknameToExternalId } from '@memequiz/shared';
import { defineStore } from 'pinia';

const NICKNAME_KEY = 'memequiz:nickname';

export const useParticipantStore = defineStore('participant', () => {
  const nickname = ref(readStorage<string>(NICKNAME_KEY) ?? '');

  // тот же ключ, что у api: по нему сравниваем «я» в лидерборде и привязываем прогресс
  const externalId = computed(() => (nickname.value ? nicknameToExternalId(nickname.value) : ''));

  function setNickname(value: string) {
    nickname.value = value;
    writeStorage(NICKNAME_KEY, value);
  }

  return { nickname, externalId, setNickname };
});

<script setup lang="ts">
import {
  NICKNAME_MAX,
  nicknameSchema,
  nicknameToExternalId,
  suggestNickname,
} from '@memequiz/shared';

const participant = useParticipantStore();
const quiz = useQuizStore();
const telegram = useTelegram();

// в Telegram предлагаем username, иначе имя; сохранённый ник важнее
function telegramNickname(): string {
  const user = telegram.user;
  if (!user) return '';
  return (
    suggestNickname(user.username ?? '') ||
    suggestNickname([user.first_name, user.last_name].filter(Boolean).join(' '))
  );
}

const input = ref(participant.nickname || telegramNickname());
const touched = ref(!!input.value);
const starting = ref(false);
const startError = ref<string | null>(null);

// те же правила, что на api
const parsed = computed(() => nicknameSchema.safeParse(input.value));
const validationError = computed(() =>
  parsed.value.success ? null : (parsed.value.error.issues[0]?.message ?? 'Неверный ник'),
);

async function start() {
  touched.value = true;
  if (!parsed.value.success || starting.value) return;

  const nickname = parsed.value.data;
  // другой участник: чужой результат и прогресс не показываем
  if (nicknameToExternalId(nickname) !== participant.externalId) {
    quiz.resetProgress();
    quiz.result = null;
    quiz.isFirst = null;
    quiz.rounds = null;
  }
  participant.setNickname(nickname);

  starting.value = true;
  startError.value = null;
  try {
    const completed = await quiz.fetchStatus();
    await navigateTo(completed ? '/result' : '/quiz');
  } catch (e) {
    startError.value = apiErrorMessage(e);
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <section class="start">
    <h1>Насколько хорошо ты знаешь мемы?</h1>
    <p class="hint">Несколько раундов, засчитывается только первая попытка.</p>

    <form class="form" novalidate @submit.prevent="start">
      <label for="nickname" class="label">Твой ник</label>
      <input
        id="nickname"
        v-model="input"
        class="input"
        :class="{ invalid: touched && validationError }"
        type="text"
        autocomplete="nickname"
        enterkeyhint="go"
        :maxlength="NICKNAME_MAX + 8"
        placeholder="Например, Вася"
        @blur="touched = true"
        @input="touched = true"
      />
      <p v-if="touched && validationError" class="error-text">{{ validationError }}</p>
      <p v-else-if="startError" class="error-text">{{ startError }}</p>

      <button class="btn" type="submit" :disabled="!!validationError || starting">
        <span v-if="starting" class="spinner" aria-hidden="true" />
        Начать
      </button>
    </form>
  </section>
</template>

<style scoped>
.start {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.form .error-text {
  margin: 0;
}

.label {
  font-weight: 600;
}

.input {
  min-height: 48px;
  padding: 12px 14px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: var(--secondary-bg);
  color: var(--text);
  /* 16px+: иначе iOS зумит страницу при фокусе */
  font: inherit;
  font-size: 17px;
  outline: none;
}

.input:focus {
  border-color: var(--accent);
}

.input.invalid {
  border-color: var(--danger);
}

.btn {
  margin-top: 8px;
}
</style>

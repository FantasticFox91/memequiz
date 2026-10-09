<script setup lang="ts">
import { NICKNAME_MAX, nicknameKey, nicknameSchema, telegramNickname } from '@memequiz/shared';

const participant = useParticipantStore();
const quiz = useQuizStore();
const telegram = useTelegram();

// в Telegram ник из профиля и не меняется (тот же, что посчитает сервер); на сайте — свой
const fixedNickname = telegram.user ? telegramNickname(telegram.user) : null;

const input = ref(fixedNickname ?? participant.nickname);
const touched = ref(!!input.value);
const starting = ref(false);
const startError = ref<string | null>(null);

// те же правила, что на api
const parsed = computed(() => nicknameSchema.safeParse(input.value));
const validationError = computed(() =>
  parsed.value.success ? null : (parsed.value.error.issues[0]?.message ?? 'Неверный ник'),
);

// Участник известен сразу (кука или user.id): если уже проходил — ведём на результат, не спрашивая ник.
// Один раз за запуск: при возврате на главную вручную не перебрасываем
const statusChecked = useState('status-checked', () => false);
const checkingStatus = ref(false);

onMounted(async () => {
  if (statusChecked.value) return;
  statusChecked.value = true;
  checkingStatus.value = true;
  try {
    const completed = await quiz.fetchStatus();
    if (completed && quiz.result) {
      participant.setNickname(quiz.result.nickname);
      await navigateTo('/result', { replace: true });
    }
  } catch {
    // не страшно: проверим ещё раз при «Начать»
  } finally {
    checkingStatus.value = false;
  }
});

const usesMainButton = useTelegramMainButton(
  () =>
    checkingStatus.value
      ? null
      : { text: 'Начать', enabled: !validationError.value, loading: starting.value },
  () => void start(),
);

const haptics = useHaptics();
// перезапуск анимации покачивания: класс снимается и ставится заново
const shaking = ref(false);
function shake() {
  haptics.notify('error');
  shaking.value = false;
  requestAnimationFrame(() => (shaking.value = true));
}

async function start() {
  touched.value = true;
  if (starting.value) return;
  if (!parsed.value.success) {
    shake();
    return;
  }

  const nickname = parsed.value.data;
  // другой ник: прогресс и результат с прошлого ника не показываем, статус спросим заново
  if (nicknameKey(nickname) !== participant.nicknameKey) {
    quiz.resetProgress();
    quiz.clearResult();
    quiz.rounds = null;
  }

  starting.value = true;
  startError.value = null;
  try {
    // на сайте заодно проверяется, что ник не занят (409 с текстом ошибки)
    const completed = await quiz.fetchStatus(fixedNickname ? undefined : nickname);
    // уже проходил: в зачёте ник первой попытки
    participant.setNickname(completed && quiz.result ? quiz.result.nickname : nickname);
    await navigateTo(completed ? '/result' : '/quiz');
  } catch (e) {
    startError.value = apiErrorMessage(e);
    shake();
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <section class="start">
    <h1 class="rise-in">Насколько хорошо ты знаешь мемы?</h1>
    <p class="hint rise-in" style="--i: 1">
      Несколько раундов. В зачёт идёт только первая попытка, потом можно проходить для себя.
    </p>

    <div v-if="checkingStatus" class="checking">
      <span class="spinner" aria-label="Загрузка" />
    </div>

    <form v-else class="form rise-in" style="--i: 2" novalidate @submit.prevent="start">
      <label for="nickname" class="label">Твой ник</label>
      <!-- в Telegram ник из профиля: только показываем -->
      <p v-if="fixedNickname" id="nickname" class="input fixed">{{ fixedNickname }}</p>
      <input
        v-else
        id="nickname"
        v-model="input"
        class="input"
        :class="{ invalid: touched && validationError, shake: shaking }"
        @animationend="shaking = false"
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

      <!-- в Telegram вместо неё MainButton; Enter в поле по-прежнему отправляет форму -->
      <button
        v-if="!usesMainButton"
        class="btn"
        type="submit"
        :disabled="!!validationError || starting"
      >
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

.checking {
  display: flex;
  justify-content: center;
  padding: 32px 0;
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
  transition: border-color 0.15s ease;
}

.input:focus {
  border-color: var(--accent);
}

.input.invalid {
  border-color: var(--danger);
}

.input.fixed {
  display: flex;
  align-items: center;
  margin: 0;
  font-weight: 600;
}

.btn {
  margin-top: 8px;
}
</style>

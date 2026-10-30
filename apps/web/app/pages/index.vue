<script setup lang="ts">
import { NICKNAME_MAX, type QuizInfo, nicknameSchema, telegramNickname } from '@memequiz/shared';

const participant = useParticipantStore();
const quiz = useQuizStore();
const telegram = useTelegram();
const haptics = useHaptics();

// в Telegram ник из профиля (тот же, что посчитает сервер); после первой засчитанной викторины —
// ник её результата: в лидербордах всех викторин участник под одним ником
const tgNickname = telegram.user ? telegramNickname(telegram.user) : null;
const fixedNickname = computed(() => quiz.lockedNickname ?? tgNickname);

const input = ref(participant.nickname);
const touched = ref(!!input.value);
// id викторины, по кнопке которой идёт проверка ника
const starting = ref<string | null>(null);
const startError = ref<string | null>(null);

const loading = ref(false);
const loadError = ref<string | null>(null);

// те же правила, что на api
const parsed = computed(() => nicknameSchema.safeParse(input.value));
const validationError = computed(() =>
  parsed.value.success ? null : (parsed.value.error.issues[0]?.message ?? 'Неверный ник'),
);

// участник известен сразу (кука или user.id): его результаты и закреплённый ник
async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    await Promise.all([quiz.fetchStatus(), quiz.loadQuizzes()]);
    if (quiz.lockedNickname) participant.setNickname(quiz.lockedNickname);
  } catch (e) {
    loadError.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// перезапуск анимации покачивания: класс снимается и ставится заново
const shaking = ref(false);
function shake() {
  haptics.notify('error');
  shaking.value = false;
  requestAnimationFrame(() => (shaking.value = true));
}

async function open(item: QuizInfo) {
  if (item.draft || starting.value) return;
  haptics.impact('light');
  startError.value = null;

  if (fixedNickname.value) {
    participant.setNickname(fixedNickname.value);
    await navigateTo(quiz.results[item.id] ? `/result/${item.id}` : `/quiz/${item.id}`);
    return;
  }

  touched.value = true;
  if (!parsed.value.success) {
    shake();
    return;
  }
  const nickname = parsed.value.data;
  starting.value = item.id;
  try {
    // ник ещё не закреплён: проверить, что он свободен (409 с текстом ошибки)
    await quiz.fetchStatus(nickname);
    participant.setNickname(quiz.lockedNickname ?? nickname);
    await navigateTo(quiz.results[item.id] ? `/result/${item.id}` : `/quiz/${item.id}`);
  } catch (e) {
    startError.value = apiErrorMessage(e);
    shake();
  } finally {
    starting.value = null;
  }
}

function questionsLabel(total: number) {
  const mod10 = total % 10;
  const mod100 = total % 100;
  if (mod10 === 1 && mod100 !== 11) return `${total} вопрос`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${total} вопроса`;
  return `${total} вопросов`;
}
</script>

<template>
  <section class="start">
    <h1 class="rise-in">Выбери викторину</h1>
    <p class="hint rise-in" style="--i: 1">
      В каждой викторине в зачёт идёт только первая попытка, потом можно проходить для себя.
    </p>

    <div v-if="loading && !quiz.quizzes" class="checking">
      <span class="spinner" aria-label="Загрузка" />
    </div>

    <ErrorState v-else-if="loadError && !quiz.quizzes" :message="loadError" @retry="load" />

    <template v-else-if="quiz.quizzes">
      <form class="form rise-in" style="--i: 2" novalidate @submit.prevent>
        <label for="nickname" class="label">Твой ник</label>
        <!-- в Telegram и после первой засчитанной викторины ник не меняется: только показываем -->
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
          enterkeyhint="done"
          :maxlength="NICKNAME_MAX + 8"
          placeholder="Например, Вася"
          @blur="touched = true"
          @input="touched = true"
        />
        <p v-if="!fixedNickname && touched && validationError" class="error-text">
          {{ validationError }}
        </p>
        <p v-else-if="startError" class="error-text">{{ startError }}</p>
      </form>

      <div class="quizzes">
        <button
          v-for="(item, i) in quiz.quizzes"
          :key="item.id"
          type="button"
          class="quiz-card rise-in"
          :class="{ done: !!quiz.results[item.id], draft: item.draft }"
          :style="{ '--i': i + 3 }"
          :disabled="item.draft || !!starting"
          @click="open(item)"
        >
          <span class="emoji" aria-hidden="true">{{ item.emoji ?? '🧩' }}</span>
          <span class="body">
            <span class="title">{{ item.title }}</span>
            <span v-if="item.description" class="description">{{ item.description }}</span>
          </span>
          <span class="meta">
            <span v-if="starting === item.id" class="spinner" aria-label="Загрузка" />
            <template v-else-if="item.draft">Скоро</template>
            <template v-else-if="quiz.results[item.id]?.pending">⏳ на проверке</template>
            <template v-else-if="quiz.results[item.id]">
              ✓ {{ quiz.results[item.id]!.score }}/{{ quiz.results[item.id]!.total }}
            </template>
            <template v-else>{{ questionsLabel(item.total) }}</template>
          </span>
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.start {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.start h1 {
  margin: 0;
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

.quizzes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.quiz-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 76px;
  padding: 14px 16px;
  border: 2px solid transparent;
  border-radius: 16px;
  background: var(--secondary-bg);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    scale 0.12s ease,
    border-color 0.15s ease;
}

.quiz-card:not(:disabled):active {
  scale: 0.98;
}

.quiz-card:disabled {
  cursor: default;
}

.quiz-card.draft {
  opacity: 0.55;
}

.quiz-card.done {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
}

.emoji {
  flex: none;
  font-size: 34px;
  line-height: 1;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title {
  font-size: 18px;
  font-weight: 700;
}

.description {
  font-size: 14px;
  color: var(--hint);
}

.meta {
  flex: none;
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--hint);
}

.done .meta {
  color: var(--success);
}
</style>

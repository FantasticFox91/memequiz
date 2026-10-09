<script setup lang="ts">
definePageMeta({ middleware: 'nickname' });

const quiz = useQuizStore();
const telegram = useTelegram();
const haptics = useHaptics();

const imageLoaded = ref(false);

onMounted(async () => {
  // уже прошёл (например, вернулся «назад» после результата); повтор «для себя» — только с экрана результата
  if (quiz.result && !quiz.practice) {
    await navigateTo('/result', { replace: true });
    return;
  }
  // свайп вниз в Telegram закрыл бы Mini App посреди викторины
  if (telegram.supports('6.2')) telegram.webApp?.enableClosingConfirmation();
  if (!quiz.rounds) await quiz.load();
});

onBeforeUnmount(() => {
  if (telegram.supports('6.2')) telegram.webApp?.disableClosingConfirmation();
});

function select(optionId: string) {
  if (optionId !== quiz.selectedOptionId) haptics.selection();
  quiz.select(optionId);
}

function startRound() {
  haptics.impact('medium');
  quiz.startRound();
}

function next() {
  if (!quiz.selectedOptionId) return;
  haptics.impact('light');
  quiz.next();
}

// одна кнопка на все состояния: начать раунд → далее → завершить
const usesMainButton = useTelegramMainButton(
  () => {
    if (!quiz.current || quiz.loading || quiz.loadError) return null;
    if (quiz.showIntro) return { text: 'Начать раунд' };
    if (!quiz.isLast) return { text: 'Далее', enabled: !!quiz.selectedOptionId };
    return {
      text: quiz.submitError ? 'Повторить' : 'Завершить',
      enabled: !!quiz.selectedOptionId && !quiz.submitting,
      loading: quiz.submitting,
    };
  },
  () => {
    if (quiz.showIntro) startRound();
    else if (!quiz.isLast) next();
    else if (quiz.selectedOptionId) void finish();
  },
);

// новая картинка: показать индикатор и заранее подгрузить следующую
watch(
  () => quiz.current?.question.id,
  () => {
    imageLoaded.value = false;
    const next = quiz.rounds?.flatMap((r) => r.questions)[quiz.index + 1];
    if (next) new Image().src = next.image;
  },
  { immediate: true },
);

// 0..1 для scaleX: анимируется без пересчёта layout
const progress = computed(() => (quiz.total ? (quiz.index + 1) / quiz.total : 0));

// ключ шага для перехода: заставка раунда и каждый вопрос — отдельные «экраны»
const stepKey = computed(() =>
  quiz.showIntro ? `intro:${quiz.current?.round.id}` : `q:${quiz.current?.question.id}`,
);

async function finish() {
  // успех отмечает экран результата
  if (await quiz.submit()) await navigateTo('/result');
  else haptics.notify('error');
}
</script>

<template>
  <section class="quiz">
    <div v-if="quiz.loading" class="center">
      <span class="spinner" aria-label="Загрузка" />
    </div>

    <ErrorState v-else-if="quiz.loadError" :message="quiz.loadError" @retry="quiz.load()" />

    <template v-else-if="quiz.current">
      <p v-if="quiz.practice" class="practice-note">Попытка для себя, в зачёт не идёт</p>

      <div class="progress">
        <div class="progress-meta">
          <span>{{ quiz.current.round.title }}</span>
          <span>{{ quiz.index + 1 }}/{{ quiz.total }}</span>
        </div>
        <div
          class="progress-bar"
          role="progressbar"
          :aria-valuenow="quiz.index + 1"
          aria-valuemin="1"
          :aria-valuemax="quiz.total"
        >
          <div class="progress-fill" :style="{ transform: `scaleX(${progress})` }" />
        </div>
      </div>

      <Transition name="step" mode="out-in">
        <!-- заставка перед первым вопросом раунда -->
        <div v-if="quiz.showIntro" :key="stepKey" class="intro">
          <h1 class="intro-title">{{ quiz.current.round.title }}</h1>
          <p v-if="quiz.current.round.description" class="intro-description rise-in" style="--i: 3">
            {{ quiz.current.round.description }}
          </p>
          <button
            v-if="!usesMainButton"
            class="btn rise-in"
            style="--i: 5"
            type="button"
            @click="startRound"
          >
            Начать раунд
          </button>
        </div>

        <div v-else :key="stepKey" class="step">
          <div class="image-box">
            <span v-if="!imageLoaded" class="spinner image-spinner" aria-hidden="true" />
            <img
              :key="quiz.current.question.id"
              :src="quiz.current.question.image"
              :alt="quiz.current.question.imageAlt"
              :class="{ loaded: imageLoaded }"
              @load="imageLoaded = true"
              @error="imageLoaded = true"
            />
          </div>

          <h2 class="question rise-in" style="--i: 1">{{ quiz.current.question.text }}</h2>

          <div class="options">
            <button
              v-for="(option, i) in quiz.current.question.options"
              :key="option.id"
              type="button"
              class="option rise-in"
              :style="{ '--i': i + 2 }"
              :class="{ selected: option.id === quiz.selectedOptionId }"
              :aria-pressed="option.id === quiz.selectedOptionId"
              :disabled="quiz.submitting"
              @click="select(option.id)"
            >
              {{ option.text }}
            </button>
          </div>

          <p v-if="quiz.submitError" class="error-text">{{ quiz.submitError }}</p>

          <!-- в Telegram вместо них MainButton -->
          <template v-if="!usesMainButton">
            <button
              v-if="!quiz.isLast"
              class="btn"
              type="button"
              :disabled="!quiz.selectedOptionId"
              @click="next"
            >
              Далее
            </button>
            <button
              v-else
              class="btn"
              type="button"
              :disabled="!quiz.selectedOptionId || quiz.submitting"
              @click="finish"
            >
              <span v-if="quiz.submitting" class="spinner" aria-hidden="true" />
              {{ quiz.submitError ? 'Повторить' : 'Завершить' }}
            </button>
          </template>
        </div>
      </Transition>
    </template>
  </section>
</template>

<style scoped>
.quiz {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  text-align: center;
}

.practice-note {
  margin: 0;
  font-size: 14px;
  color: var(--hint);
  text-align: center;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  color: var(--hint);
  margin-bottom: 6px;
}

.progress-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--secondary-bg);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transition: transform 0.4s var(--ease-out);
}

/* смена вопроса: старый уезжает влево, новый приезжает справа */
.step-enter-active,
.step-leave-active {
  transition:
    opacity 0.2s ease,
    translate 0.2s var(--ease-out);
}

.step-enter-from {
  opacity: 0;
  translate: 24px 0;
}

.step-leave-to {
  opacity: 0;
  translate: -24px 0;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.intro {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 32px 0;
  text-align: center;
}

.intro-title {
  animation: pop-in 0.45s var(--ease-spring) both;
}

.intro-description {
  margin: 0 0 16px;
  font-size: 18px;
  color: var(--hint);
}

/* фиксированное соотношение сторон: вёрстка не прыгает, пока грузится картинка */
.image-box {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  background: var(--secondary-bg);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-box img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-box img.loaded {
  opacity: 1;
}

.image-spinner {
  position: absolute;
  color: var(--hint);
}

.question {
  margin: 0;
  font-size: 20px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option {
  min-height: 52px;
  padding: 12px 16px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: var(--secondary-bg);
  color: var(--text);
  font: inherit;
  font-size: 18px;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    scale 0.12s ease,
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.option:not(:disabled):active {
  scale: 0.98;
}

.option.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, var(--secondary-bg));
  /* rise-in остаётся первым в списке: так он не перезапускается при выборе и снятии выбора */
  animation:
    rise-in 0.35s var(--ease-out) calc(var(--i, 0) * 45ms) both,
    option-pick 0.3s var(--ease-spring);
}

@keyframes option-pick {
  50% {
    scale: 1.03;
  }
}

@media (prefers-reduced-motion: reduce) {
  .step-enter-from,
  .step-leave-to {
    translate: none;
  }

  .option.selected {
    animation: rise-in 0.35s var(--ease-out) calc(var(--i, 0) * 45ms) both;
  }
}

.option:disabled {
  cursor: default;
}

.error-text {
  margin: 0;
}
</style>

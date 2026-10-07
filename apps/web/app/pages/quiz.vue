<script setup lang="ts">
definePageMeta({ middleware: 'nickname' });

const quiz = useQuizStore();
const telegram = useTelegram();

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
  if (optionId !== quiz.selectedOptionId && telegram.supports('6.1')) {
    telegram.webApp?.HapticFeedback.selectionChanged();
  }
  quiz.select(optionId);
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
    if (quiz.showIntro) quiz.startRound();
    else if (!quiz.isLast) quiz.next();
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

const progressPercent = computed(() =>
  quiz.total ? Math.round(((quiz.index + 1) / quiz.total) * 100) : 0,
);

async function finish() {
  if (await quiz.submit()) await navigateTo('/result');
}
</script>

<template>
  <section class="quiz">
    <div v-if="quiz.loading" class="center">
      <span class="spinner" aria-label="Загрузка" />
    </div>

    <div v-else-if="quiz.loadError" class="center">
      <p class="error-text">{{ quiz.loadError }}</p>
      <button class="btn" type="button" @click="quiz.load()">Повторить</button>
    </div>

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
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
      </div>

      <!-- заставка перед первым вопросом раунда -->
      <div v-if="quiz.showIntro" class="intro">
        <h1>{{ quiz.current.round.title }}</h1>
        <p v-if="quiz.current.round.description" class="intro-description">
          {{ quiz.current.round.description }}
        </p>
        <button v-if="!usesMainButton" class="btn" type="button" @click="quiz.startRound()">
          Начать раунд
        </button>
      </div>

      <template v-else>
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

        <h2 class="question">{{ quiz.current.question.text }}</h2>

        <div class="options">
          <button
            v-for="option in quiz.current.question.options"
            :key="option.id"
            type="button"
            class="option"
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
            @click="quiz.next()"
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
      </template>
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
  transition: width 0.3s ease;
}

.intro {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 32px 0;
  text-align: center;
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
}

.option.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, var(--secondary-bg));
}

.option:disabled {
  cursor: default;
}

.error-text {
  margin: 0;
}
</style>

<script setup lang="ts">
definePageMeta({ middleware: 'nickname' });

const quiz = useQuizStore();

const loading = ref(false);
const error = ref<string | null>(null);

const { share } = useShareResult();
// подпись кнопки после попытки поделиться: «скопировано» вместо системного меню на компьютере
const shareFeedback = ref<string | null>(null);
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

// делимся засчитанным результатом: он и в лидерборде
async function shareResult() {
  const r = quiz.result;
  if (!r) return;
  const time = r.durationMs != null ? ` за ${formatDuration(r.durationMs)}` : '';
  const text = `Мой результат в MemeQuiz: ${r.score} из ${r.total}${time} — «${verdict(r.score, r.total)}» 🧠\nСможешь лучше?`;
  const outcome = await share(text);
  if (outcome === 'copied') shareFeedback.value = 'Скопировано, отправь другу ✓';
  else if (outcome === 'failed') shareFeedback.value = 'Не получилось, попробуй ещё раз';
  else return;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => (shareFeedback.value = null), 2500);
}
onBeforeUnmount(() => clearTimeout(feedbackTimer));

// в Telegram главное действие — поделиться: выбор чата нативный и в один тап
const usesMainButton = useTelegramMainButton(
  () => (quiz.result && !loading.value ? { text: 'Поделиться результатом' } : null),
  () => void shareResult(),
);

// после перезагрузки результата в store нет: берём его из статуса
async function loadResult() {
  loading.value = true;
  error.value = null;
  try {
    const completed = await quiz.fetchStatus();
    if (!completed) await navigateTo('/quiz', { replace: true });
  } catch (e) {
    error.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (!quiz.result) void loadResult();
});

async function retry() {
  quiz.startPractice();
  await navigateTo('/quiz');
}

// крупно показываем только что пройденную попытку; засчитанный результат — рядом
const shown = computed(() => quiz.attempt ?? quiz.result);

// только что отправили (а не открыли результат заново): вибрация и конфетти, один раз
const justFinished = quiz.celebrate;
quiz.celebrate = false;
const haptics = useHaptics();
const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// баллы «набегают» от нуля
const displayedScore = ref(0);
let frame = 0;
watch(
  () => shown.value?.score,
  (score) => {
    cancelAnimationFrame(frame);
    if (score == null) return;
    if (reducedMotion || score === 0) {
      displayedScore.value = score;
      return;
    }
    const duration = Math.min(1200, 300 + score * 40);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      displayedScore.value = Math.round(score * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  },
  { immediate: true },
);
onBeforeUnmount(() => cancelAnimationFrame(frame));

const ratio = computed(() => (shown.value?.total ? shown.value.score / shown.value.total : 0));
const showConfetti = computed(() => justFinished && !reducedMotion && ratio.value >= 0.7);

onMounted(() => {
  if (justFinished) haptics.notify(ratio.value >= 0.5 ? 'success' : 'warning');
});

// разлёт: случайные, но стабильные на время показа
const CONFETTI = ['🎉', '🔥', '🐸', '😂', '🏆', '✨', '🤯', '💯'];
const confetti = Array.from({ length: 28 }, (_, i) => ({
  emoji: CONFETTI[i % CONFETTI.length],
  style: {
    '--x': `${Math.round(Math.random() * 100)}vw`,
    '--drift': `${Math.round((Math.random() - 0.5) * 120)}px`,
    '--rot': `${Math.round((Math.random() - 0.5) * 720)}deg`,
    '--delay': `${Math.round(Math.random() * 400)}ms`,
    '--dur': `${1600 + Math.round(Math.random() * 900)}ms`,
  },
}));

const countedText = computed(() => {
  const r = quiz.result;
  if (!r) return '';
  const time = r.durationMs != null ? `, за ${formatDuration(r.durationMs)}` : '';
  return `${r.score} из ${r.total}${time}`;
});

function verdict(score: number, total: number): string {
  const ratio = total ? score / total : 0;
  if (ratio < 0.3) return 'Новичок в мемах';
  if (ratio < 0.7) return 'Уверенный пользователь';
  if (ratio < 0.9) return 'Мемолог 80 уровня';
  return 'Легенда мемов';
}
</script>

<template>
  <section class="result">
    <div v-if="loading" class="center">
      <span class="spinner" aria-label="Загрузка" />
    </div>

    <ErrorState v-else-if="error" :message="error" @retry="loadResult" />

    <template v-else-if="quiz.result && shown">
      <p class="hint rise-in">
        {{ quiz.result.nickname }}, {{ quiz.attempt ? 'результат этой попытки' : 'твой результат' }}
      </p>
      <p class="score" :aria-label="`${shown.score} из ${shown.total}`">
        {{ displayedScore }} <span class="score-total">из {{ shown.total }}</span>
      </p>
      <p v-if="shown.durationMs != null" class="time rise-in" style="--i: 2">
        за {{ formatDuration(shown.durationMs) }}
      </p>
      <h1 class="verdict">{{ verdict(shown.score, shown.total) }}</h1>

      <p v-if="quiz.isFirst === false" class="note rise-in" style="--i: 8">
        В зачёт и лидерборд идёт первая попытка: {{ countedText }}.
      </p>

      <button
        v-if="!usesMainButton"
        class="btn rise-in"
        style="--i: 9"
        type="button"
        aria-live="polite"
        @click="shareResult"
      >
        {{ shareFeedback ?? 'Поделиться результатом' }}
      </button>
      <NuxtLink to="/leaderboard" class="btn btn-secondary rise-in" style="--i: 10">
        Лидерборд
      </NuxtLink>
      <button class="btn btn-secondary rise-in" style="--i: 11" type="button" @click="retry">
        Пройти ещё раз для себя
      </button>

      <div v-if="showConfetti" class="confetti" aria-hidden="true">
        <span v-for="(piece, i) in confetti" :key="i" :style="piece.style">{{ piece.emoji }}</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 24px;
  text-align: center;
}

.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
}

.hint {
  margin: 0;
}

.score {
  margin: 0;
  font-size: 64px;
  font-weight: 800;
  line-height: 1.1;
  /* цифры одной ширины: число не дёргается, пока набегает */
  font-variant-numeric: tabular-nums;
  animation: pop-in 0.5s var(--ease-spring) both;
}

/* вердикт появляется, когда баллы почти досчитались */
.verdict {
  animation: pop-in 0.5s var(--ease-spring) 0.7s both;
}

.confetti {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 10;
}

.confetti span {
  position: absolute;
  top: -40px;
  left: var(--x);
  font-size: 26px;
  animation: confetti-fall var(--dur) cubic-bezier(0.25, 0.6, 0.5, 1) var(--delay) both;
}

@keyframes confetti-fall {
  from {
    translate: 0 0;
    rotate: 0deg;
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  to {
    translate: var(--drift) 105vh;
    rotate: var(--rot);
    opacity: 0;
  }
}

.time {
  margin: 0;
  color: var(--hint);
}

.score-total {
  font-size: 24px;
  font-weight: 600;
  color: var(--hint);
}

.note {
  margin: 0 0 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--secondary-bg);
}

.btn {
  margin-top: 16px;
}

.btn + .btn {
  margin-top: 0;
}
</style>

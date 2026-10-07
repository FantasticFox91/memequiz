<script setup lang="ts">
definePageMeta({ middleware: 'nickname' });

const quiz = useQuizStore();

const loading = ref(false);
const error = ref<string | null>(null);

const usesMainButton = useTelegramMainButton(
  () => (quiz.result && !loading.value ? { text: 'Лидерборд' } : null),
  () => void navigateTo('/leaderboard'),
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

    <div v-else-if="error" class="center">
      <p class="error-text">{{ error }}</p>
      <button class="btn" type="button" @click="loadResult">Повторить</button>
    </div>

    <template v-else-if="quiz.result && shown">
      <p class="hint">
        {{ quiz.result.nickname }}, {{ quiz.attempt ? 'результат этой попытки' : 'твой результат' }}
      </p>
      <p class="score">
        {{ shown.score }} <span class="score-total">из {{ shown.total }}</span>
      </p>
      <p v-if="shown.durationMs != null" class="time">за {{ formatDuration(shown.durationMs) }}</p>
      <h1>{{ verdict(shown.score, shown.total) }}</h1>

      <p v-if="quiz.isFirst === false" class="note">
        В зачёт и лидерборд идёт первая попытка: {{ countedText }}.
      </p>

      <NuxtLink v-if="!usesMainButton" to="/leaderboard" class="btn">Лидерборд</NuxtLink>
      <button class="btn btn-secondary" type="button" @click="retry">
        Пройти ещё раз для себя
      </button>
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

<script setup lang="ts">
definePageMeta({ middleware: 'nickname' });

const quiz = useQuizStore();

const loading = ref(false);
const error = ref<string | null>(null);

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

    <template v-else-if="quiz.result">
      <p class="hint">{{ quiz.result.nickname }}, твой результат</p>
      <p class="score">
        {{ quiz.result.score }} <span class="score-total">из {{ quiz.result.total }}</span>
      </p>
      <h1>{{ verdict(quiz.result.score, quiz.result.total) }}</h1>

      <p v-if="quiz.isFirst === false" class="note">
        Ты уже проходил викторину. Засчитан твой первый результат: {{ quiz.result.score }}.
      </p>

      <NuxtLink to="/leaderboard" class="btn">Лидерборд</NuxtLink>
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
</style>

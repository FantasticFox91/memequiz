<script setup lang="ts">
import type { HealthResponse } from '@memequiz/shared';

const api = useApi();
const health = ref<HealthResponse | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    health.value = await api<HealthResponse>('/health');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<template>
  <section>
    <h1>Привет! Это MemeQuiz</h1>
    <p>Здесь будет ввод ника и старт викторины.</p>

    <div class="status">
      <span v-if="health">API: {{ health.status }}, БД: {{ health.db }}</span>
      <span v-else-if="error" class="error">API недоступен: {{ error }}</span>
      <span v-else>Проверяем API…</span>
    </div>

    <NuxtLink to="/quiz">К викторине →</NuxtLink>
  </section>
</template>

<style scoped>
.status {
  background: var(--secondary-bg);
  border-radius: 12px;
  padding: 12px 14px;
  margin: 16px 0;
  font-size: 14px;
}

.error {
  color: var(--danger);
}
</style>

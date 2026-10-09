<script setup lang="ts">
import type { NuxtError } from '#app';

// Nuxt показывает эту страницу на несуществующем адресе (404) и на необработанной ошибке
const props = defineProps<{ error: NuxtError }>();

const notFound = computed(() => props.error.statusCode === 404);

useHead({ title: () => (notFound.value ? 'Страница не найдена · MemeQuiz' : 'Ошибка · MemeQuiz') });

const goHome = () => clearError({ redirect: '/' });

useTelegramMainButton(() => ({ text: 'На главную' }), goHome);
</script>

<template>
  <NuxtLayout>
    <section class="error-page">
      <p class="code" aria-hidden="true">{{ notFound ? '404' : '😵' }}</p>
      <h1>{{ notFound ? 'Такого мема у нас нет' : 'Что-то сломалось' }}</h1>
      <p class="hint">
        {{
          notFound
            ? 'Похоже, ссылка устарела или в ней опечатка.'
            : 'Попробуй вернуться на главную и начать заново.'
        }}
      </p>
      <!-- в Telegram то же действие на MainButton -->
      <button v-if="!useTelegram().webApp" class="btn" type="button" @click="goHome">
        На главную
      </button>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 48px;
  text-align: center;
}

.code {
  margin: 0;
  font-size: 88px;
  font-weight: 800;
  line-height: 1;
  color: var(--accent);
  animation: wobble 2.4s ease-in-out infinite;
}

/* лёгкое покачивание «потерянного» 404 */
@keyframes wobble {
  0%,
  100% {
    rotate: -4deg;
  }
  50% {
    rotate: 4deg;
  }
}

h1 {
  margin: 8px 0 0;
  animation: rise-in 0.35s var(--ease-out) 0.1s both;
}

.hint {
  margin: 0 0 16px;
  animation: rise-in 0.35s var(--ease-out) 0.2s both;
}

.btn {
  max-width: 280px;
  animation: rise-in 0.35s var(--ease-out) 0.3s both;
}

@media (prefers-reduced-motion: reduce) {
  .code {
    animation: none;
  }
}
</style>

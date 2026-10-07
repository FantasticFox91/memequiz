<template>
  <div class="layout">
    <header class="header">
      <NuxtLink to="/" class="logo">MemeQuiz</NuxtLink>
      <NuxtLink to="/leaderboard">Лидерборд</NuxtLink>
    </header>
    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
/*
 * Отступы: env(safe-area-inset-*) в браузере; в Telegram (fullscreen) системная safe area
 * и зона под кнопками клиента приходят в --tg-safe-area-inset-* и --tg-content-safe-area-inset-*.
 */
.layout {
  --inset-top: max(
    env(safe-area-inset-top, 0px),
    calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))
  );
  --inset-bottom: max(
    env(safe-area-inset-bottom, 0px),
    calc(var(--tg-safe-area-inset-bottom, 0px) + var(--tg-content-safe-area-inset-bottom, 0px))
  );
  --inset-left: max(env(safe-area-inset-left, 0px), var(--tg-safe-area-inset-left, 0px));
  --inset-right: max(env(safe-area-inset-right, 0px), var(--tg-safe-area-inset-right, 0px));

  max-width: 480px;
  min-height: 100dvh;
  margin: 0 auto;
  padding: calc(16px + var(--inset-top)) calc(16px + var(--inset-right))
    calc(16px + var(--inset-bottom)) calc(16px + var(--inset-left));
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* в Telegram 100vh/dvh врут, пока панель тянется; stable height выставляет telegram-web-app.js */
html[data-tg] .layout {
  min-height: var(--tg-viewport-stable-height, 100dvh);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  font-weight: 700;
  font-size: 20px;
  color: var(--text);
}

.content {
  flex: 1;
}
</style>

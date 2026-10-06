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
.layout {
  max-width: 480px;
  min-height: 100dvh;
  margin: 0 auto;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 16px;
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

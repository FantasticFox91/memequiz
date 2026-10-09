<script setup lang="ts">
/**
 * Экран ошибки загрузки с кнопкой «Повторить». Без сети — свой текст,
 * а когда сеть вернулась (событие online), повтор запускается сам.
 */
const props = defineProps<{ message: string }>();
const emit = defineEmits<{ retry: [] }>();

const haptics = useHaptics();
const offline = ref(typeof navigator !== 'undefined' && navigator.onLine === false);

function retry() {
  haptics.impact('light');
  emit('retry');
}

function onOnline() {
  offline.value = false;
  emit('retry');
}
function onOffline() {
  offline.value = true;
}

onMounted(() => {
  haptics.notify('error');
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
});
onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
});

const text = computed(() =>
  offline.value ? 'Нет интернета. Как только он появится, попробуем снова' : props.message,
);
</script>

<template>
  <div class="error-state" role="alert">
    <span class="icon" aria-hidden="true">{{ offline ? '📡' : '🙈' }}</span>
    <p class="text">{{ text }}</p>
    <button class="btn" type="button" @click="retry">Повторить</button>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  text-align: center;
  animation: rise-in 0.35s var(--ease-out) both;
}

.icon {
  font-size: 48px;
  line-height: 1;
  animation: pop-in 0.45s var(--ease-spring) both;
}

.text {
  margin: 0;
  max-width: 320px;
  color: var(--hint);
}

.btn {
  max-width: 240px;
}
</style>

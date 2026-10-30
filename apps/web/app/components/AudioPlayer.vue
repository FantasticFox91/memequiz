<script setup lang="ts">
/**
 * Плеер фрагмента песни для вопросов «угадай песню». Своя кнопка вместо нативных controls:
 * они по-разному выглядят в WebView Telegram. Автоплея нет — WebView без жеста пользователя не играет.
 */
const props = defineProps<{ src: string }>();

const haptics = useHaptics();
const audio = ref<HTMLAudioElement | null>(null);
const playing = ref(false);
const waiting = ref(false);
const failed = ref(false);
const current = ref(0);
const duration = ref(0);

// 0..1 для scaleX, как у прогресса викторины
const progress = computed(() => (duration.value ? current.value / duration.value : 0));

async function toggle() {
  const el = audio.value;
  if (!el) return;
  haptics.impact('light');
  if (!el.paused) {
    el.pause();
    return;
  }
  failed.value = false;
  try {
    await el.play();
  } catch {
    // play() отклоняется, если файл не загрузился или браузер запретил воспроизведение
    failed.value = true;
  }
}

function seek(event: PointerEvent) {
  const el = audio.value;
  if (!el || !duration.value) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  el.currentTime =
    Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) * duration.value;
}

function onEnded() {
  playing.value = false;
  current.value = 0;
  if (audio.value) audio.value.currentTime = 0;
}

// свернули Mini App или вкладку — музыка не должна играть в фоне
function onVisibility() {
  if (document.hidden) audio.value?.pause();
}

onMounted(() => document.addEventListener('visibilitychange', onVisibility));
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  // отсоединённый от DOM элемент в некоторых браузерах продолжает играть
  audio.value?.pause();
});

function formatTime(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
</script>

<template>
  <div class="player" :class="{ playing }">
    <audio
      ref="audio"
      :src="props.src"
      preload="auto"
      @play="playing = true"
      @pause="playing = false"
      @waiting="waiting = true"
      @playing="waiting = false"
      @canplay="waiting = false"
      @loadedmetadata="duration = audio?.duration ?? 0"
      @timeupdate="current = audio?.currentTime ?? 0"
      @ended="onEnded"
      @error="failed = true"
    />

    <button type="button" class="play" :aria-label="playing ? 'Пауза' : 'Слушать'" @click="toggle">
      <span v-if="playing && waiting" class="spinner" aria-hidden="true" />
      <svg v-else-if="playing" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
      </svg>
    </button>

    <div class="body">
      <p v-if="failed" class="status error-text">Не удалось загрузить песню, попробуйте ещё раз</p>
      <p v-else class="status">{{ playing ? 'Играет…' : 'Нажмите, чтобы послушать' }}</p>
      <div class="track" @pointerdown="seek">
        <div class="track-bar">
          <div class="track-fill" :style="{ transform: `scaleX(${progress})` }" />
        </div>
      </div>
      <div class="time">
        <span>{{ formatTime(current) }}</span>
        <span>{{ duration ? formatTime(duration) : '–:––' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
  background: var(--secondary-bg);
}

.play {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
  color: var(--accent-text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: scale 0.12s ease;
}

.play:active {
  scale: 0.94;
}

.play svg {
  width: 28px;
  height: 28px;
  fill: currentColor;
}

/* пока играет — мягкая пульсация кнопки */
.playing .play {
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent);
  }
  50% {
    box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent) 0%, transparent);
  }
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status {
  margin: 0;
  font-size: 15px;
  color: var(--hint);
}

/* увеличенная зона нажатия вокруг тонкой полоски */
.track {
  padding: 10px 0;
  margin: -10px 0;
  cursor: pointer;
  touch-action: none;
}

.track-bar {
  height: 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--text) 12%, transparent);
  overflow: hidden;
}

.track-fill {
  height: 100%;
  background: var(--accent);
  transform-origin: left;
}

.time {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--hint);
}

@media (prefers-reduced-motion: reduce) {
  .playing .play {
    animation: none;
  }
}
</style>

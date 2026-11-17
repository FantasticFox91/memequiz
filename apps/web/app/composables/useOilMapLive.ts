import type { OilMapEvent, OilMapResponse } from '@memequiz/shared';

export interface OilMapActivity {
  key: number;
  day: number;
  pointId: string;
  holder: string | null;
  by: string | null;
  at: Date;
}

const ACTIVITY_MAX = 6;

/**
 * Общая карта нефти: грузим с сервера и держим открытым SSE-поток.
 * Отметки держателей применяются сразу (оптимистично) и расходятся остальным через поток;
 * смена раскладки или обрыв связи — перечитываем карту целиком.
 */
export function useOilMapLive(mapId: Ref<string | null>) {
  const api = useApi();
  const { apiBase } = useRuntimeConfig().public;

  const map = ref<OilMapResponse | null>(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle');
  const online = ref(0);
  const connected = ref(false);
  const activity = ref<OilMapActivity[]>([]);
  let activitySeq = 0;
  let source: EventSource | null = null;
  // после обрыва при переподключении перечитываем: пока связи не было, события терялись
  let needsReload = false;

  async function load(id = mapId.value) {
    if (!id) return;
    if (!map.value || map.value.id !== id) status.value = 'loading';
    try {
      const data = await api<OilMapResponse>(`/oil-maps/${id}`);
      if (id !== mapId.value) return;
      map.value = data;
      status.value = 'ready';
    } catch (e) {
      if (id !== mapId.value) return;
      const code = (e as { status?: number }).status;
      status.value = code === 404 ? 'missing' : 'error';
      if (code === 404) map.value = null;
    }
  }

  function handle(event: OilMapEvent) {
    const current = map.value;
    switch (event.type) {
      case 'holder': {
        const day = current?.days[event.day - 1];
        // дня ещё нет — значит его только что добавили: перечитаем по событию layout
        if (!day) return;
        if (event.holder) day[event.pointId] = event.holder;
        else delete day[event.pointId];
        activity.value = [
          { key: ++activitySeq, ...event, at: new Date(event.at) },
          ...activity.value,
        ].slice(0, ACTIVITY_MAX);
        return;
      }
      case 'layout':
        if (!current || event.version > current.version) void load();
        return;
      case 'image':
        if (current) current.imageVersion = event.imageVersion;
        return;
      case 'presence':
        online.value = event.online;
        return;
      case 'deleted':
        map.value = null;
        status.value = 'missing';
        disconnect();
    }
  }

  function connect(id: string) {
    disconnect();
    source = new EventSource(`${apiBase}/oil-maps/${id}/events`);
    source.onopen = () => {
      connected.value = true;
      if (needsReload) void load(id);
      needsReload = false;
    };
    source.onerror = () => {
      connected.value = false;
      needsReload = true;
    };
    source.onmessage = (e: MessageEvent<string>) => {
      try {
        handle(JSON.parse(e.data) as OilMapEvent);
      } catch {
        // битое событие пропускаем: следующее перечитывание всё выровняет
      }
    };
  }

  function disconnect() {
    source?.close();
    source = null;
    connected.value = false;
    online.value = 0;
  }

  // свёрнутый Telegram/вкладка: поток мог закрыться насовсем (CLOSED) — поднимаем заново
  function onVisible() {
    const id = mapId.value;
    if (document.visibilityState !== 'visible' || !id || status.value === 'missing') return;
    if (!source || source.readyState === EventSource.CLOSED) {
      needsReload = false;
      void load(id);
      connect(id);
    }
  }

  watch(
    mapId,
    (id) => {
      disconnect();
      activity.value = [];
      if (!id) {
        map.value = null;
        status.value = 'idle';
        return;
      }
      void load(id);
      connect(id);
    },
    { immediate: true },
  );

  onMounted(() => document.addEventListener('visibilitychange', onVisible));
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisible);
    disconnect();
  });

  async function setHolder(day: number, pointId: string, holder: string | null, by: string) {
    const current = map.value;
    const holders = current?.days[day - 1];
    if (!current || !holders) return;
    const previous = holders[pointId] ?? null;
    if (holder) holders[pointId] = holder;
    else delete holders[pointId];
    try {
      await api(`/oil-maps/${current.id}/holders/${pointId}`, {
        method: 'PUT',
        body: { holder, day, by: by || undefined },
      });
    } catch (e) {
      // не прошло: возвращаем как было и перечитываем — могли поменять раскладку или дни
      if (previous) holders[pointId] = previous;
      else delete holders[pointId];
      void load(current.id);
      throw e;
    }
  }

  const imageUrl = computed(() =>
    map.value?.imageVersion
      ? `${apiBase}/oil-maps/${map.value.id}/image?v=${map.value.imageVersion}`
      : null,
  );

  return { map, status, online, connected, activity, imageUrl, load, setHolder };
}

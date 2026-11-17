<script setup lang="ts">
import type {
  BotInfoResponse,
  OilMapLayout,
  OilMapListItem,
  OilMapPoint,
  OilMapResponse,
  OilPointType,
} from '@memequiz/shared';
import { formatOilClock, formatOilMinutes, oilCycle } from '~/utils/oil';
import { OIL_MAP_TEMPLATES, type OilMapTemplate } from '~/utils/oil-map-templates';

useHead({ title: 'Карта нефти · MemeQuiz' });
// на десктопе до 1440px: карта слева, легенды справа
definePageMeta({ wide: true });

/*
 * Общие карты нефти. Владелец в конструкторе расставляет точки (XS…XXL), связи и союзы;
 * у кого есть ссылка — отмечает, какой союз на какой точке. Изменения видны всем сразу (SSE),
 * легенда считает итог каждого союза к сбросу.
 */

const FREE = 'free';
const IMAGE_MAX_SIDE = 1600;
const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];
const RECENT_KEY = 'oil-map-recent';
const RECENT_MAX = 10;
const PALETTE = [
  '#3d9be9',
  '#e02424',
  '#1e8e3e',
  '#17b8b8',
  '#ec4f97',
  '#f28a1b',
  '#a3cf1f',
  '#7e2fc4',
];

type PointShape = 'diamond' | 'square' | 'circle';

// размер — в процентах ширины карты; label — префикс авто-имени («S-03»)
const POINT_TYPES: Record<
  OilPointType,
  { reward: number; shape: PointShape; size: number; label?: string }
> = {
  XS: { reward: 100, shape: 'diamond', size: 2.7 },
  'S◆': { reward: 200, shape: 'diamond', size: 2.85, label: 'S' },
  S: { reward: 300, shape: 'square', size: 2.85 },
  M: { reward: 375, shape: 'diamond', size: 3 },
  'M■': { reward: 400, shape: 'square', size: 3, label: 'M' },
  L: { reward: 600, shape: 'square', size: 3.1 },
  XL: { reward: 1000, shape: 'square', size: 3.25 },
  XXL: { reward: 2000, shape: 'square', size: 3.9 },
  '★': { reward: 0, shape: 'circle', size: 3 },
};
const TYPE_KEYS = Object.keys(POINT_TYPES) as OilPointType[];

function uid(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function defaultLayout(name: string): OilMapLayout {
  return {
    name,
    aspect: 1,
    points: [],
    links: [],
    alliances: [
      { id: 'us', name: '1', color: PALETTE[0]! },
      { id: uid('a'), name: '2', color: PALETTE[1]! },
    ],
  };
}

const api = useApi();
const route = useRoute();
const router = useRouter();
const haptics = useHaptics();
const participant = useParticipantStore();
const telegram = useTelegram();

const mapId = computed(() => {
  const id = route.query.id;
  return typeof id === 'string' && /^[A-Za-z0-9]{10}$/.test(id) ? id : null;
});

const live = useOilMapLive(mapId);
const { map, status, online, connected, activity, imageUrl } = live;

// 403/404/409 api присылает понятным текстом — показываем его, остальное через общий разбор
function errorMessage(e: unknown): string {
  const { status: code, data } = e as { status?: number; data?: { message?: unknown } };
  if (code && [400, 403, 404, 409].includes(code) && typeof data?.message === 'string') {
    return data.message;
  }
  return apiErrorMessage(e);
}

const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  recent.value = readStorage<RecentMap[]>(RECENT_KEY) ?? [];
  timer = setInterval(() => (now.value = new Date()), 15_000);
});
onUnmounted(() => clearInterval(timer));

// ---------- список карт ----------

interface RecentMap {
  id: string;
  name: string;
}

const myMaps = ref<OilMapListItem[]>([]);
const recent = ref<RecentMap[]>([]);
const listError = ref('');
const creating = ref(false);
const codeInput = ref('');

async function loadList() {
  try {
    myMaps.value = await api<OilMapListItem[]>('/oil-maps');
    listError.value = '';
  } catch (e) {
    listError.value = errorMessage(e);
  }
}

// чужие карты запоминаем: ссылку из чата потом не найти
watch(
  () => map.value && { id: map.value.id, name: map.value.layout.name, own: map.value.isOwner },
  (info) => {
    if (!info || info.own) return;
    recent.value = [
      { id: info.id, name: info.name },
      ...recent.value.filter((m) => m.id !== info.id),
    ].slice(0, RECENT_MAX);
    writeStorage(RECENT_KEY, recent.value);
  },
);

const otherMaps = computed(() => {
  const own = new Set(myMaps.value.map((m) => m.id));
  return recent.value.filter((m) => !own.has(m.id));
});

function forgetRecent(id: string) {
  recent.value = recent.value.filter((m) => m.id !== id);
  writeStorage(RECENT_KEY, recent.value);
}

// ссылка целиком или только код
function openByCode() {
  const match = /(?:id=|map_)?([A-Za-z0-9]{10})\s*$/.exec(codeInput.value.trim());
  if (!match) {
    listError.value = 'Не похоже на ссылку или код карты';
    return;
  }
  codeInput.value = '';
  void router.push({ query: { id: match[1] } });
}

// основа для новой карты: '' — пустая, иначе id карты, которую копируем
const baseId = ref('');
const baseOptions = computed<RecentMap[]>(() => [
  ...myMaps.value.map((m) => ({ id: m.id, name: m.name })),
  ...otherMaps.value,
]);

// шаблон → раскладка: очки — стандартные для типа, держателей нет
function templateLayout(template: OilMapTemplate): OilMapLayout {
  return {
    name: template.name,
    aspect: 1,
    points: template.points.map((p) => ({
      id: p.key,
      type: p.type,
      x: p.x,
      y: p.y,
      reward: POINT_TYPES[p.type].reward,
      name: p.name,
    })),
    links: template.links.map(([a, b]) => [a, b]),
    alliances: template.alliances.map((a) => ({ ...a })),
  };
}

async function createMap() {
  creating.value = true;
  listError.value = '';
  const template = OIL_MAP_TEMPLATES.find((t) => `tpl:${t.id}` === baseId.value);
  const base = baseOptions.value.find((m) => m.id === baseId.value);
  const name = base ? `${base.name.slice(0, 32)} (копия)` : `Карта ${myMaps.value.length + 1}`;
  try {
    const created = await api<OilMapResponse>('/oil-maps', {
      method: 'POST',
      body: template
        ? { layout: templateLayout(template) }
        : { layout: defaultLayout(name), ...(base ? { from: base.id } : {}) },
    });
    baseId.value = '';
    map.value = created;
    status.value = 'ready';
    await router.push({ query: { id: created.id } });
    startEdit();
  } catch (e) {
    listError.value = errorMessage(e);
  } finally {
    creating.value = false;
  }
}

// ---------- конструктор: правим копию, на сервер уходит по «Сохранить» ----------

type ImageDraft = { kind: 'keep' } | { kind: 'none' } | { kind: 'new'; blob: Blob; url: string };

const draft = ref<OilMapLayout | null>(null);
const draftMapId = ref<string | null>(null);
// с какой версии начали править: сервер отклонит сохранение, если карта успела измениться
const draftVersion = ref(0);
const draftImage = ref<ImageDraft>({ kind: 'keep' });
const editing = computed(() => draft.value !== null);
const saving = ref(false);
const conflict = ref(false);
const errorText = ref('');

const layout = computed<OilMapLayout | null>(() => draft.value ?? map.value?.layout ?? null);
const shownImage = computed(() => {
  if (!editing.value) return imageUrl.value;
  const d = draftImage.value;
  return d.kind === 'new' ? d.url : d.kind === 'keep' ? imageUrl.value : null;
});

// инструмент конструктора: ставить точки или соединять их
const tool = ref<'points' | 'links'>('points');
const newType = ref<OilPointType>('S');
const selectedId = ref<string | null>(null);
// первая точка будущей связи
const linkFrom = ref<string | null>(null);

function dropDraftImage() {
  if (draftImage.value.kind === 'new') URL.revokeObjectURL(draftImage.value.url);
  draftImage.value = { kind: 'keep' };
}

function startEdit() {
  const current = map.value;
  if (!current?.isOwner) return;
  draft.value = JSON.parse(JSON.stringify(current.layout)) as OilMapLayout;
  draftMapId.value = current.id;
  draftVersion.value = current.version;
  dropDraftImage();
  selectedId.value = null;
  linkFrom.value = null;
  tool.value = 'points';
  conflict.value = false;
  errorText.value = '';
  confirmDelete.value = false;
}

function cancelEdit() {
  dropDraftImage();
  draft.value = null;
  draftMapId.value = null;
  selectedId.value = null;
  linkFrom.value = null;
  conflict.value = false;
  errorText.value = '';
}

async function saveEdit() {
  const edited = draft.value;
  const id = draftMapId.value;
  if (!edited || !id || saving.value) return;
  saving.value = true;
  errorText.value = '';
  const body = {
    version: draftVersion.value,
    layout: { ...edited, name: edited.name.trim() || 'Без названия' },
  };
  try {
    const saved = await api<OilMapResponse>(`/oil-maps/${id}`, { method: 'PUT', body });

    let imageError = '';
    const image = draftImage.value;
    try {
      if (image.kind === 'new') {
        await api(`/oil-maps/${id}/image`, {
          method: 'PUT',
          body: image.blob,
          headers: { 'Content-Type': image.blob.type },
        });
      } else if (image.kind === 'none' && map.value?.imageVersion) {
        await api(`/oil-maps/${id}/image`, { method: 'DELETE' });
      }
    } catch (e) {
      imageError = `Карта сохранена, но фон не загрузился: ${errorMessage(e)}`;
    }

    map.value = saved;
    cancelEdit();
    // версия фона приходит отдельно: перечитываем, чтобы показать новую картинку
    if (image.kind !== 'keep') void live.load(id);
    errorText.value = imageError;
    haptics.notify(imageError ? 'warning' : 'success');
  } catch (e) {
    if ((e as { status?: number }).status === 409) {
      conflict.value = true;
      haptics.notify('warning');
    } else {
      errorText.value = errorMessage(e);
      haptics.notify('error');
    }
  } finally {
    saving.value = false;
  }
}

// конфликт: карту сохранили с другого устройства — по выбору перезаписываем своей версией
async function overwrite() {
  const id = draftMapId.value;
  if (!id) return;
  await live.load(id);
  if (map.value) draftVersion.value = map.value.version;
  conflict.value = false;
  await saveEdit();
}

// удаление в два тапа вместо confirm(): в WebView Telegram диалоги ведут себя по-разному
const confirmDelete = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

function armConfirm(flag: Ref<boolean>): boolean {
  if (flag.value) {
    flag.value = false;
    return true;
  }
  flag.value = true;
  clearTimeout(confirmTimer);
  confirmTimer = setTimeout(() => (flag.value = false), 3_000);
  return false;
}

async function deleteMap() {
  const id = draftMapId.value;
  if (!id || !armConfirm(confirmDelete)) return;
  try {
    await api(`/oil-maps/${id}`, { method: 'DELETE' });
    cancelEdit();
    haptics.impact('medium');
    await router.replace({ query: {} });
  } catch (e) {
    errorText.value = errorMessage(e);
  }
}

const fileInput = ref<HTMLInputElement>();

async function compressImage(file: File): Promise<{ blob: Blob; aspect: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8),
    );
    if (!blob) throw new Error('toBlob failed');
    return { blob, aspect: w / h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function onImagePicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !draft.value) return;
  try {
    const { blob, aspect } = await compressImage(file);
    dropDraftImage();
    draftImage.value = { kind: 'new', blob, url: URL.createObjectURL(blob) };
    draft.value.aspect = Math.round(aspect * 1000) / 1000;
    errorText.value = '';
  } catch {
    errorText.value = 'Не получилось открыть картинку';
  }
}

function removeImage() {
  dropDraftImage();
  draftImage.value = { kind: 'none' };
}

// фон в игре можно спрятать, чтобы не мешал цветам союзов
const showImage = ref(true);

// ---------- масштаб ----------

// по умолчанию ×4
const zoomIndex = ref(ZOOMS.indexOf(4));
const zoom = computed(() => ZOOMS[zoomIndex.value]!);
const viewport = ref<HTMLElement>();

// масштабируем относительно центра видимой области
function setZoom(index: number) {
  const el = viewport.value;
  const next = Math.min(Math.max(index, 0), ZOOMS.length - 1);
  if (!el || next === zoomIndex.value) return;
  const ratio = ZOOMS[next]! / zoom.value;
  const cx = el.scrollLeft + el.clientWidth / 2;
  const cy = el.scrollTop + el.clientHeight / 2;
  zoomIndex.value = next;
  nextTick(() => {
    el.scrollLeft = cx * ratio - el.clientWidth / 2;
    el.scrollTop = cy * ratio - el.clientHeight / 2;
  });
}

// ---------- полный экран ----------

/*
 * Свой оверлей вместо Fullscreen API: в iOS и WebView Telegram он не работает.
 * Карта та же самая — тапы по точкам и шторка работают как обычно.
 */
const fullscreen = ref(false);

// размер окна меняется — сохраняем, какая часть карты была в центре
function setFullscreen(on: boolean) {
  const el = viewport.value;
  if (fullscreen.value === on) return;
  const fx = el ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5;
  const fy = el ? (el.scrollTop + el.clientHeight / 2) / el.scrollHeight : 0.5;
  fullscreen.value = on;
  haptics.selection();
  nextTick(() => {
    if (!el) return;
    el.scrollLeft = fx * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = fy * el.scrollHeight - el.clientHeight / 2;
  });
}

function onFullscreenKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !fullscreen.value) return;
  // Esc сначала закрывает шторку точки, потом полный экран
  if (selectedId.value) selectedId.value = null;
  else setFullscreen(false);
}
onMounted(() => document.addEventListener('keydown', onFullscreenKey));
onUnmounted(() => document.removeEventListener('keydown', onFullscreenKey));

// страница под оверлеем не должна прокручиваться
watch(fullscreen, (on) => document.documentElement.classList.toggle('map-fullscreen', on));
onUnmounted(() => document.documentElement.classList.remove('map-fullscreen'));

// «Назад» (Telegram или браузера) в полном экране — выйти из него, а не со страницы
function exitFullscreenFirst() {
  if (!fullscreen.value) return true;
  selectedId.value = null;
  setFullscreen(false);
  return false;
}
onBeforeRouteUpdate(exitFullscreenFirst);
onBeforeRouteLeave(exitFullscreenFirst);

// ---------- точки на карте ----------

const surface = ref<HTMLElement>();

function toMapCoords(event: { clientX: number; clientY: number }): { x: number; y: number } {
  const rect = surface.value!.getBoundingClientRect();
  const clamp = (v: number) => Math.round(Math.min(Math.max(v, 0), 100) * 100) / 100;
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100),
  };
}

// ---------- магнит: выравнивание по другим точкам и по клеткам сетки ----------

// сетка фона 80×80 (см. .surface background-size)
const GRID = 80;
// на каком расстоянии в экранных пикселях точка «присасывается»
const SNAP_PX = 9;

const snapOn = ref(true);
// направляющие, к которым притянулась точка: отрезки в % карты
const guides = ref<{ key: string; x1: number; y1: number; x2: number; y2: number }[]>([]);
let guidesTimer: ReturnType<typeof setTimeout> | undefined;

// прямая a·x + b·y = c в пикселях; from — точка, от которой идёт направляющая
interface SnapLine {
  a: number;
  b: number;
  c: number;
  from?: { x: number; y: number };
}

const lineDistance = (l: SnapLine, x: number, y: number) =>
  Math.abs(l.a * x + l.b * y - l.c) / Math.hypot(l.a, l.b);

function intersect(l1: SnapLine, l2: SnapLine): { x: number; y: number } | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-9) return null;
  return { x: (l1.c * l2.b - l2.c * l1.b) / det, y: (l1.a * l2.c - l2.a * l1.c) / det };
}

function project(l: SnapLine, x: number, y: number): { x: number; y: number } {
  const k = (l.a * x + l.b * y - l.c) / (l.a * l.a + l.b * l.b);
  return { x: x - k * l.a, y: y - k * l.b };
}

/**
 * Притягивает позицию к вертикали, горизонтали и диагоналям (45°) других точек,
 * к пересечениям этих линий и к центрам клеток. Считаем в экранных пикселях:
 * диагональ должна быть 45° на экране, а у карты бывает любое соотношение сторон.
 */
function snap(
  raw: { x: number; y: number },
  excludeId: string | null,
  disabled: boolean,
): { x: number; y: number } {
  const target = draft.value;
  const rect = surface.value?.getBoundingClientRect();
  if (!snapOn.value || disabled || !target || !rect?.width) {
    guides.value = [];
    return raw;
  }
  const W = rect.width;
  const H = rect.height;
  const px = (raw.x / 100) * W;
  const py = (raw.y / 100) * H;

  const lines: SnapLine[] = [];
  for (const q of target.points) {
    if (q.id === excludeId) continue;
    const qx = (q.x / 100) * W;
    const qy = (q.y / 100) * H;
    const from = { x: qx, y: qy };
    lines.push({ a: 1, b: 0, c: qx, from }); // вертикаль
    lines.push({ a: 0, b: 1, c: qy, from }); // горизонталь
    lines.push({ a: -1, b: 1, c: qy - qx, from }); // диагональ ↘
    lines.push({ a: 1, b: 1, c: qy + qx, from }); // диагональ ↗
  }
  // линии через центры ближайших клеток: слабее линий точек, нужны для пересечений
  const cellW = W / GRID;
  const cellH = H / GRID;
  const gx = (Math.floor(px / cellW) + 0.5) * cellW;
  const gy = (Math.floor(py / cellH) + 0.5) * cellH;
  const gridLines: SnapLine[] = [
    { a: 1, b: 0, c: gx },
    { a: 0, b: 1, c: gy },
  ];

  const near = lines
    .map((l) => ({ l, d: lineDistance(l, px, py) }))
    .filter((n) => n.d < SNAP_PX)
    .sort((m, n) => m.d - n.d);

  let result = { x: px, y: py };
  let used: SnapLine[] = [];
  const first = near[0]?.l;
  if (first) {
    // пересечение с другой линией (точки или клетки) рядом — встаём ровно в него
    let best: { p: { x: number; y: number }; l: SnapLine; d: number } | null = null;
    for (const l of [...near.slice(1).map((n) => n.l), ...gridLines]) {
      const p = intersect(first, l);
      if (!p) continue;
      const d = Math.hypot(p.x - px, p.y - py);
      // линии точек приоритетнее: у клеточных порог меньше
      const limit = l.from ? SNAP_PX * 1.5 : SNAP_PX;
      if (d < limit && (!best || d < best.d)) best = { p, l, d };
    }
    if (best) {
      result = best.p;
      used = [first, best.l];
    } else {
      result = project(first, px, py);
      used = [first];
    }
  } else {
    // ни одной линии рядом — только центр клетки, по каждой оси отдельно
    if (Math.abs(px - gx) < SNAP_PX) result.x = gx;
    if (Math.abs(py - gy) < SNAP_PX) result.y = gy;
  }

  const clamp = (v: number) => Math.round(Math.min(Math.max(v, 0), 100) * 100) / 100;
  const snapped = { x: clamp((result.x / W) * 100), y: clamp((result.y / H) * 100) };

  guides.value = used.flatMap((l, i) =>
    l.from
      ? [
          {
            key: `g${i}`,
            x1: (l.from.x / W) * 100,
            y1: (l.from.y / H) * 100,
            x2: snapped.x,
            y2: snapped.y,
          },
        ]
      : [],
  );
  return snapped;
}

function flashGuides() {
  clearTimeout(guidesTimer);
  guidesTimer = setTimeout(() => (guides.value = []), 700);
}

// «S-07»: следующий свободный номер этого типа
function nextName(target: OilMapLayout, type: OilPointType): string {
  if (type === '★') return '';
  // S◆ и S делят префикс «S», поэтому занятые имена смотрим по всем точкам
  const prefix = POINT_TYPES[type].label ?? type;
  const used = new Set(target.points.map((p) => p.name));
  let n = 1;
  while (used.has(`${prefix}-${String(n).padStart(2, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(2, '0')}`;
}

function onSurfaceClick(event: MouseEvent) {
  const target = draft.value;
  if (!target || tool.value !== 'points') {
    selectedId.value = null;
    linkFrom.value = null;
    return;
  }
  // первый тап по пустому месту закрывает редактор точки, а не ставит новую
  if (selectedId.value) {
    selectedId.value = null;
    return;
  }
  target.points.push({
    id: uid('pt'),
    type: newType.value,
    ...snap(toMapCoords(event), null, event.altKey),
    reward: POINT_TYPES[newType.value].reward,
    name: nextName(target, newType.value),
  });
  flashGuides();
  haptics.impact('light');
}

let drag: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
// после перетаскивания браузер всё равно шлёт click: его не считаем выбором
let suppressClick = false;

function onPointDown(event: PointerEvent) {
  if (!editing.value || tool.value !== 'points') return;
  drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
  suppressClick = false;
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
}

/*
 * iOS и WebView Telegram не всегда слушают touch-action: none — палец, начавший тянуть
 * точку, всё равно прокручивает карту или страницу. Пока идёт перетаскивание, гасим
 * touchmove сами (слушатель не passive, иначе preventDefault не работает).
 */
function blockTouchScroll(event: TouchEvent) {
  if (drag && event.cancelable) event.preventDefault();
}
onMounted(() => document.addEventListener('touchmove', blockTouchScroll, { passive: false }));
onUnmounted(() => document.removeEventListener('touchmove', blockTouchScroll));

// в конструкторе и в полном экране вертикальный свайп Telegram сворачивал бы Mini App
// вместо перетаскивания точки или прокрутки карты
watch(
  () => editing.value || fullscreen.value,
  (on) => {
    const webApp = telegram.webApp;
    if (!webApp || !telegram.supports('7.7')) return;
    if (on) webApp.disableVerticalSwipes?.();
    else webApp.enableVerticalSwipes?.();
  },
);
onUnmounted(() => {
  if (telegram.supports('7.7')) telegram.webApp?.enableVerticalSwipes?.();
});

function onPointMove(event: PointerEvent, point: OilMapPoint) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) {
    return;
  }
  drag.moved = true;
  clearTimeout(guidesTimer);
  Object.assign(point, snap(toMapCoords(event), point.id, event.altKey));
}

function onPointUp() {
  if (drag?.moved) {
    suppressClick = true;
    flashGuides();
  }
  drag = null;
}

function onPointClick(point: OilMapPoint) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const target = draft.value;
  if (target && tool.value === 'links') {
    // тап по двум точкам: связать, повторно — разорвать; цепочкой — от последней точки
    const from = linkFrom.value;
    if (!from) {
      linkFrom.value = point.id;
    } else if (from === point.id) {
      linkFrom.value = null;
    } else {
      const index = target.links.findIndex(
        ([a, b]) => (a === from && b === point.id) || (a === point.id && b === from),
      );
      if (index === -1) target.links.push([from, point.id]);
      else target.links.splice(index, 1);
      linkFrom.value = point.id;
    }
    haptics.selection();
    return;
  }
  selectedId.value = !target && selectedId.value === point.id ? null : point.id;
  haptics.selection();
}

const selectedPoint = computed(
  () => layout.value?.points.find((p) => p.id === selectedId.value) ?? null,
);

const lines = computed(() => {
  const current = layout.value;
  if (!current) return [];
  const byId = new Map(current.points.map((p) => [p.id, p]));
  return current.links.flatMap(([a, b]) => {
    const p = byId.get(a);
    const q = byId.get(b);
    return p && q ? [{ key: `${a}-${b}`, x1: p.x, y1: p.y, x2: q.x, y2: q.y }] : [];
  });
});

function clean(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1_000_000) : 0;
}

function setPointType(point: OilMapPoint, type: OilPointType) {
  const target = draft.value;
  if (!target || point.type === type) return;
  // авто-имя и стандартные очки меняем вместе с типом, ручные правки не трогаем
  const autoName = point.name === '' || /^[A-Z]+-\d+$/.test(point.name);
  const autoReward = point.reward === POINT_TYPES[point.type].reward;
  point.type = type;
  newType.value = type;
  if (autoReward) point.reward = POINT_TYPES[type].reward;
  if (autoName) point.name = nextName(target, type);
}

function deletePoint(id: string) {
  const target = draft.value;
  if (!target) return;
  target.points = target.points.filter((p) => p.id !== id);
  target.links = target.links.filter(([a, b]) => a !== id && b !== id);
  selectedId.value = null;
}

function setTool(value: 'points' | 'links') {
  tool.value = value;
  selectedId.value = null;
  linkFrom.value = null;
}

// после объявления draft/selectedId: immediate-watch срабатывает сразу
watch(
  mapId,
  (id) => {
    if (!id) void loadList();
    // открыли другую карту — правки прежней не тащим
    if (draft.value && draftMapId.value !== id) cancelEdit();
    selectedId.value = null;
    errorText.value = '';
  },
  { immediate: true },
);

// ---------- союзы (меняет владелец в конструкторе) ----------

function addAlliance() {
  const target = draft.value;
  if (!target) return;
  const used = new Set(target.alliances.map((a) => a.color));
  const color =
    PALETTE.find((c) => !used.has(c)) ?? PALETTE[target.alliances.length % PALETTE.length]!;
  target.alliances.push({ id: uid('a'), name: String(target.alliances.length + 1), color });
}

function removeAlliance(id: string) {
  if (draft.value) draft.value.alliances = draft.value.alliances.filter((a) => a.id !== id);
}

// ---------- кто где сидит ----------

const allianceById = computed(() => new Map((layout.value?.alliances ?? []).map((a) => [a.id, a])));

// ---------- дни: у каждого дня своя расстановка ----------

const daysCount = computed(() => map.value?.days.length ?? 1);
// выбранный день, с 1
const day = ref(1);

// новая карта — открываем последний день; добавили день, пока смотрели последний, — идём за ним
watch(
  () => [map.value?.id, daysCount.value] as const,
  ([id, count], previous) => {
    const [prevId, prevCount] = previous ?? [];
    if (id !== prevId || (prevCount !== undefined && day.value === prevCount)) day.value = count;
    else day.value = Math.min(day.value, count);
  },
  { immediate: true },
);

function goDay(next: number) {
  day.value = Math.min(Math.max(next, 1), daysCount.value);
  selectedId.value = null;
  haptics.selection();
}

const dayBusy = ref(false);
async function addDay() {
  const id = map.value?.id;
  if (!id || dayBusy.value) return;
  dayBusy.value = true;
  try {
    await api(`/oil-maps/${id}/days`, { method: 'POST' });
    await live.load(id);
    day.value = daysCount.value;
    errorText.value = '';
    haptics.notify('success');
  } catch (e) {
    errorText.value = errorMessage(e);
    // день мог добавить кто-то другой одновременно: показываем актуальное
    void live.load(id);
  } finally {
    dayBusy.value = false;
  }
}

const confirmRemoveDay = ref(false);
async function removeLastDay() {
  const id = map.value?.id;
  if (!id || dayBusy.value || !armConfirm(confirmRemoveDay)) return;
  dayBusy.value = true;
  try {
    await api(`/oil-maps/${id}/days/last`, { method: 'DELETE' });
    await live.load(id);
    haptics.impact('medium');
  } catch (e) {
    errorText.value = errorMessage(e);
  } finally {
    dayBusy.value = false;
  }
}

// держатель, которого нет среди союзов раскладки (удалён в черновике), — как свободная точка
function holderOf(pointId: string, d = day.value): string {
  const holder = map.value?.days[d - 1]?.[pointId];
  return holder && allianceById.value.has(holder) ? holder : FREE;
}

function holderColor(pointId: string): string | null {
  return allianceById.value.get(holderOf(pointId))?.color ?? null;
}

async function setHolder(pointId: string, allianceId: string) {
  selectedId.value = null;
  haptics.selection();
  try {
    await live.setHolder(
      day.value,
      pointId,
      allianceId === FREE ? null : allianceId,
      participant.nickname,
    );
    errorText.value = '';
  } catch (e) {
    errorText.value = errorMessage(e);
    haptics.notify('error');
  }
}

const confirmClear = ref(false);
async function clearHolders() {
  const id = map.value?.id;
  if (!id || !armConfirm(confirmClear)) return;
  try {
    await api(`/oil-maps/${id}/holders`, { method: 'DELETE', query: { day: day.value } });
    await live.load(id);
    haptics.impact('medium');
  } catch (e) {
    errorText.value = errorMessage(e);
  }
}

// ---------- поделиться ----------

const shareNote = ref('');
const botUsername = ref<string | null>(null);
onMounted(async () => {
  if (!telegram.isTelegram) return;
  try {
    botUsername.value = (await api<BotInfoResponse>('/bot')).username;
  } catch {
    // без username поделимся ссылкой на сайт
  }
});

async function share() {
  const current = map.value;
  if (!current) return;
  const text = `Карта нефти «${current.layout.name}»`;
  // в Telegram — ссылка на Mini App: карта откроется сразу в нём (см. plugins/telegram.client.ts)
  const url =
    telegram.webApp && botUsername.value
      ? `https://t.me/${botUsername.value}?startapp=map_${current.id}`
      : `${location.origin}/map?id=${current.id}`;

  if (telegram.webApp) {
    telegram.webApp.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    );
    return;
  }
  const data: ShareData = { title: text, url };
  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    shareNote.value = 'Ссылка скопирована';
  } catch {
    shareNote.value = url;
  }
  setTimeout(() => (shareNote.value = ''), 4_000);
}

// ---------- легенда ----------

const legend = computed(() => {
  const points = layout.value?.points ?? [];
  const total = points.reduce((sum, p) => sum + p.reward, 0);
  const rows = (layout.value?.alliances ?? [])
    .map((alliance) => {
      const held = points.filter((p) => holderOf(p.id) === alliance.id);
      return { ...alliance, count: held.length, sum: held.reduce((sum, p) => sum + p.reward, 0) };
    })
    .sort((a, b) => b.sum - a.sum);
  const free = points.filter((p) => holderOf(p.id) === FREE);
  const leader =
    rows[0] && rows[0].sum > 0 && rows[0].sum > (rows[1]?.sum ?? 0) ? rows[0].id : null;
  return {
    rows,
    total,
    leader,
    free: { count: free.length, sum: free.reduce((sum, p) => sum + p.reward, 0) },
  };
});

// всего за все дни: каждый день союз получает очки своих точек этого дня
const totals = computed(() => {
  const points = layout.value?.points ?? [];
  const sums = new Map<string, number>();
  for (let d = 1; d <= daysCount.value; d++) {
    for (const p of points) {
      const holder = holderOf(p.id, d);
      if (holder !== FREE) sums.set(holder, (sums.get(holder) ?? 0) + p.reward);
    }
  }
  const rows = (layout.value?.alliances ?? [])
    .map((alliance) => ({ ...alliance, sum: sums.get(alliance.id) ?? 0 }))
    .sort((a, b) => b.sum - a.sum);
  const max = rows[0]?.sum ?? 0;
  const leader = rows[0] && max > 0 && max > (rows[1]?.sum ?? 0) ? rows[0].id : null;
  return { rows, max, leader };
});

const activityRows = computed(() =>
  activity.value.map((a) => ({
    key: a.key,
    day: a.day,
    by: a.by,
    point: layout.value?.points.find((p) => p.id === a.pointId)?.name || 'точка',
    holder: a.holder ? allianceById.value.get(a.holder) : null,
    time: formatOilClock(a.at),
  })),
);

const cycle = computed(() => oilCycle(now.value));
const fmt = (n: number) => n.toLocaleString('ru-RU');
const share100 = (n: number) => (legend.value.total ? (n / legend.value.total) * 100 : 0);
// 1 день, 2 дня, 5 дней
function plural(n: number, [one, few, many]: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const shareOfMax = (n: number) => (totals.value.max ? (n / totals.value.max) * 100 : 0);
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
</script>

<template>
  <section class="map-page" :class="{ 'sheet-open': selectedPoint, list: !mapId }">
    <NuxtLink :to="mapId ? '/map' : '/oil'" class="back rise-in">
      ← {{ mapId ? 'Все карты' : 'Калькулятор нефти' }}
    </NuxtLink>

    <!-- ===== список карт ===== -->
    <template v-if="!mapId">
      <h1 class="rise-in">Карты нефти</h1>
      <p class="hint rise-in" style="--i: 1">
        Нарисуй карту в конструкторе и поделись ссылкой с союзом: все видят, кто на какой точке, и
        отмечают захваты вместе — изменения приходят сразу.
      </p>

      <div class="card rise-in" style="--i: 2">
        <h2>Мои карты</h2>
        <NuxtLink v-for="m in myMaps" :key="m.id" :to="{ query: { id: m.id } }" class="map-link">
          <span>{{ m.name }}</span>
          <span class="hint small">{{ formatDate(m.updatedAt) }}</span>
        </NuxtLink>
        <p v-if="!myMaps.length" class="hint small">Пока нет своих карт</p>
        <label class="base-pick">
          <span class="hint small">Основа</span>
          <select v-model="baseId" class="input">
            <option value="">Пустая карта</option>
            <option v-for="t in OIL_MAP_TEMPLATES" :key="t.id" :value="`tpl:${t.id}`">
              Шаблон: {{ t.name }}
            </option>
            <option v-for="m in baseOptions" :key="m.id" :value="m.id">Копия: {{ m.name }}</option>
          </select>
        </label>
        <button type="button" class="btn" :disabled="creating" @click="createMap">
          {{ creating ? 'Создаём…' : '+ Новая карта' }}
        </button>
      </div>

      <div class="card rise-in" style="--i: 3">
        <h2>Карты союза</h2>
        <div v-for="m in otherMaps" :key="m.id" class="row">
          <NuxtLink :to="{ query: { id: m.id } }" class="map-link grow">{{ m.name }}</NuxtLink>
          <button
            type="button"
            class="icon-btn"
            aria-label="Убрать из списка"
            @click="forgetRecent(m.id)"
          >
            ✕
          </button>
        </div>
        <p v-if="!otherMaps.length" class="hint small">
          Здесь появятся карты, которые ты открывал по ссылке
        </p>
        <form class="row" @submit.prevent="openByCode">
          <input
            v-model="codeInput"
            class="input name"
            type="text"
            placeholder="Ссылка или код карты"
            autocomplete="off"
          />
          <button type="submit" class="btn btn-secondary small-btn">Открыть</button>
        </form>
      </div>
      <p v-if="listError" class="error-text">{{ listError }}</p>
    </template>

    <!-- ===== состояния загрузки ===== -->
    <p v-else-if="status === 'loading' || status === 'idle'" class="hint">Загружаем карту…</p>
    <div v-else-if="status === 'missing'" class="card">
      <h2>Карта не найдена</h2>
      <p class="hint small">Её удалили или в ссылке ошибка.</p>
      <button
        type="button"
        class="btn btn-secondary"
        @click="
          forgetRecent(mapId!);
          router.push({ query: {} });
        "
      >
        К списку карт
      </button>
    </div>
    <div v-else-if="status === 'error' || !map || !layout" class="card">
      <h2>Нет связи с сервером</h2>
      <button type="button" class="btn btn-secondary" @click="live.load()">Повторить</button>
    </div>

    <!-- ===== карта ===== -->
    <div v-else class="map-grid">
      <div class="map-main">
        <div class="title-row rise-in">
          <h1>{{ layout.name }}</h1>
          <span class="presence" :class="{ off: !connected }">
            {{ connected ? `● ${online} онлайн` : '○ переподключаемся…' }}
          </span>
        </div>

        <div class="card rise-in" :class="{ 'has-fullscreen': fullscreen }" style="--i: 1">
          <div v-if="!editing" class="toolbar">
            <button type="button" class="btn btn-secondary small-btn" @click="share">
              🔗 Поделиться
            </button>
            <button
              v-if="map.isOwner"
              type="button"
              class="btn btn-secondary small-btn"
              @click="startEdit"
            >
              ✏️ Конструктор
            </button>
            <span v-if="shareNote" class="hint small">{{ shareNote }}</span>
          </div>

          <div v-if="!editing" class="day-bar">
            <button
              type="button"
              class="icon-btn plain"
              :disabled="day === 1"
              aria-label="Предыдущий день"
              @click="goDay(day - 1)"
            >
              ‹
            </button>
            <b class="day-label">
              День {{ day }}
              <span class="hint small">из {{ daysCount }}</span>
            </b>
            <button
              type="button"
              class="icon-btn plain"
              :disabled="day === daysCount"
              aria-label="Следующий день"
              @click="goDay(day + 1)"
            >
              ›
            </button>
            <span class="spacer" />
            <button
              type="button"
              class="btn btn-secondary small-btn"
              :disabled="dayBusy"
              @click="addDay"
            >
              + Новый день
            </button>
          </div>

          <template v-else-if="draft">
            <input
              v-model="draft.name"
              class="input"
              type="text"
              maxlength="40"
              placeholder="Название карты"
            />
            <div class="segmented two">
              <button
                type="button"
                :class="{ active: tool === 'points' }"
                @click="setTool('points')"
              >
                Точки
              </button>
              <button type="button" :class="{ active: tool === 'links' }" @click="setTool('links')">
                Связи
              </button>
            </div>
            <template v-if="tool === 'points'">
              <div class="types">
                <button
                  v-for="t in TYPE_KEYS"
                  :key="t"
                  type="button"
                  :class="{ active: newType === t }"
                  @click="newType = t"
                >
                  <b>{{ t }}</b>
                  <span>{{ POINT_TYPES[t].reward || 'база' }}</span>
                </button>
              </div>
              <div class="snap-row">
                <p class="hint small grow">
                  Тап по карте — поставить {{ newType }}. Тяни точку — переместить, тап — изменить.
                </p>
                <button
                  type="button"
                  class="btn btn-secondary small-btn snap-toggle"
                  :class="{ active: snapOn }"
                  :aria-pressed="snapOn"
                  title="Притягивать к линиям других точек и центрам клеток. Alt — временно без магнита"
                  @click="snapOn = !snapOn"
                >
                  🧲 {{ snapOn ? 'Магнит' : 'Без магнита' }}
                </button>
              </div>
            </template>
            <p v-else class="hint small">
              Тапай точки по очереди — они соединятся цепочкой. Тап по уже связанной паре —
              разорвать.
              {{ linkFrom ? 'Тап по той же точке — закончить цепочку.' : '' }}
            </p>
          </template>

          <div class="map-stage" :class="{ fullscreen }">
            <div class="zoom-bar">
              <button
                v-if="fullscreen"
                type="button"
                class="icon-btn plain close-full"
                aria-label="Закрыть полный экран"
                @click="setFullscreen(false)"
              >
                ✕
              </button>
              <template v-if="fullscreen && !editing">
                <button
                  type="button"
                  class="icon-btn plain"
                  :disabled="day === 1"
                  aria-label="Предыдущий день"
                  @click="goDay(day - 1)"
                >
                  ‹
                </button>
                <b class="day-label compact"
                  >Д{{ day }}<span class="hint small">/{{ daysCount }}</span></b
                >
                <button
                  type="button"
                  class="icon-btn plain"
                  :disabled="day === daysCount"
                  aria-label="Следующий день"
                  @click="goDay(day + 1)"
                >
                  ›
                </button>
                <span class="spacer" />
              </template>
              <button
                type="button"
                class="icon-btn plain"
                :disabled="zoomIndex === 0"
                aria-label="Отдалить"
                @click="setZoom(zoomIndex - 1)"
              >
                −
              </button>
              <span class="hint small">×{{ zoom }}</span>
              <button
                type="button"
                class="icon-btn plain"
                :disabled="zoomIndex === ZOOMS.length - 1"
                aria-label="Приблизить"
                @click="setZoom(zoomIndex + 1)"
              >
                +
              </button>
              <span v-if="!fullscreen || editing" class="spacer" />
              <template v-if="draft && !fullscreen">
                <button
                  type="button"
                  class="btn btn-secondary small-btn"
                  @click="fileInput?.click()"
                >
                  🖼 {{ shownImage ? 'Сменить фон' : 'Фон' }}
                </button>
                <button
                  v-if="shownImage"
                  type="button"
                  class="btn btn-secondary small-btn"
                  @click="removeImage"
                >
                  ✕ фон
                </button>
                <input
                  ref="fileInput"
                  type="file"
                  accept="image/*"
                  hidden
                  @change="onImagePicked"
                />
              </template>
              <label v-else-if="shownImage && !editing" class="hint small toggle">
                <input v-model="showImage" type="checkbox" /> фон
              </label>
              <button
                v-if="!fullscreen"
                type="button"
                class="icon-btn plain"
                aria-label="Открыть карту на весь экран"
                title="На весь экран"
                @click="setFullscreen(true)"
              >
                ⛶
              </button>
            </div>

            <div ref="viewport" class="viewport">
              <div
                ref="surface"
                class="surface"
                :class="{ editing, linking: editing && tool === 'links', 'has-image': shownImage }"
                :style="{ width: `${zoom * 100}%`, aspectRatio: String(layout.aspect) }"
                @click="onSurfaceClick"
              >
                <img
                  v-if="shownImage && (editing || showImage)"
                  :src="shownImage"
                  alt=""
                  class="surface-image"
                  :class="{ faded: editing }"
                  draggable="false"
                />
                <svg
                  class="links"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <line
                    v-for="l in lines"
                    :key="l.key"
                    :x1="l.x1"
                    :y1="l.y1"
                    :x2="l.x2"
                    :y2="l.y2"
                    vector-effect="non-scaling-stroke"
                  />
                  <line
                    v-for="g in editing ? guides : []"
                    :key="g.key"
                    class="guide"
                    :x1="g.x1"
                    :y1="g.y1"
                    :x2="g.x2"
                    :y2="g.y2"
                    vector-effect="non-scaling-stroke"
                  />
                </svg>
                <button
                  v-for="point in layout.points"
                  :key="point.id"
                  type="button"
                  class="point"
                  :class="[
                    POINT_TYPES[point.type].shape,
                    {
                      selected: point.id === selectedId || point.id === linkFrom,
                      free: !holderColor(point.id),
                    },
                  ]"
                  :style="{
                    left: `${point.x}%`,
                    top: `${point.y}%`,
                    '--size': `${POINT_TYPES[point.type].size}cqw`,
                    '--point-color': holderColor(point.id) ?? undefined,
                  }"
                  :aria-label="`${point.name || point.type}: ${point.reward} очков`"
                  @click.stop="onPointClick(point)"
                  @pointerdown="onPointDown"
                  @pointermove="onPointMove($event, point)"
                  @pointerup="onPointUp"
                  @pointercancel="onPointUp"
                >
                  <span class="point-body" />
                  <span class="point-text">
                    <span v-if="point.name" class="point-name">{{ point.name }}</span>
                    <span v-if="point.reward" class="point-reward">{{ point.reward }}</span>
                  </span>
                </button>
                <p v-if="!layout.points.length" class="surface-empty hint small">
                  {{
                    editing
                      ? 'Тапни, чтобы поставить первую точку. Можно подложить скриншот карты как фон.'
                      : map.isOwner
                        ? 'Точек нет — открой конструктор'
                        : 'Владелец ещё не нарисовал карту'
                  }}
                </p>
              </div>
            </div>
          </div>

          <div v-if="conflict" class="conflict">
            <b>Карту уже сохранили с другого устройства.</b>
            <span class="hint small">Твои правки пока не сохранены.</span>
            <div class="actions">
              <button type="button" class="btn" :disabled="saving" @click="overwrite">
                Перезаписать моей
              </button>
              <button type="button" class="btn btn-secondary" @click="cancelEdit">
                Взять ту версию
              </button>
            </div>
          </div>

          <p v-if="errorText" class="error-text">{{ errorText }}</p>

          <div v-if="editing && !conflict" class="actions">
            <button type="button" class="btn" :disabled="saving" @click="saveEdit">
              {{ saving ? 'Сохраняем…' : 'Сохранить' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="saving" @click="cancelEdit">
              Отмена
            </button>
            <button type="button" class="btn btn-secondary danger" @click="deleteMap">
              {{ confirmDelete ? 'Точно удалить карту для всех?' : 'Удалить карту' }}
            </button>
          </div>
          <p v-else-if="!editing && layout.points.length" class="hint small">
            Тапни по точке, чтобы отметить, чья она. Видят все, у кого есть ссылка.
          </p>
        </div>
      </div>

      <aside class="map-side">
        <div v-if="draft" class="card rise-in" style="--i: 2">
          <h2>Союзы</h2>
          <div v-for="a in draft.alliances" :key="a.id" class="row">
            <input v-model="a.color" type="color" class="color" aria-label="Цвет" />
            <input
              v-model="a.name"
              class="input name"
              type="text"
              maxlength="24"
              placeholder="Союз"
            />
            <button
              v-if="draft.alliances.length > 1"
              type="button"
              class="icon-btn"
              aria-label="Удалить союз"
              @click="removeAlliance(a.id)"
            >
              ✕
            </button>
          </div>
          <button
            v-if="draft.alliances.length < 16"
            type="button"
            class="btn btn-secondary"
            @click="addAlliance"
          >
            + Добавить союз
          </button>
          <p class="hint small">Удалённый союз снимается со всех своих точек после сохранения</p>
        </div>

        <div class="card rise-in" style="--i: 3">
          <h2>За день {{ day }}</h2>
          <p v-if="day === daysCount" class="hint small">
            Сброс через {{ formatOilMinutes(cycle.minutesLeft) }} (в
            {{ formatOilClock(cycle.endsAt) }}), если точки никто не перехватит
          </p>
          <p v-else class="hint small">Сколько союзы получили в этот день</p>
          <ul class="legend">
            <li
              v-for="row in legend.rows"
              :key="row.id"
              :class="{ leader: row.id === legend.leader }"
            >
              <span class="dot" :style="{ background: row.color }" />
              <span class="legend-name">
                {{ row.name || 'Без имени' }}{{ row.id === legend.leader ? ' 👑' : '' }}
                <span class="hint small">{{ row.count }} т.</span>
              </span>
              <span class="legend-sum">{{ fmt(row.sum) }}</span>
              <span
                class="bar"
                :style="{ width: `${share100(row.sum)}%`, background: row.color }"
              />
            </li>
            <li v-if="legend.free.count">
              <span class="dot" />
              <span class="legend-name">
                Свободно <span class="hint small">{{ legend.free.count }} т.</span>
              </span>
              <span class="legend-sum">{{ fmt(legend.free.sum) }}</span>
            </li>
          </ul>
          <p class="hint small">
            Всего на карте: {{ fmt(legend.total) }} · {{ layout.points.length }} точек
          </p>
          <button
            v-if="!editing && map.isOwner && Object.keys(map.days[day - 1] ?? {}).length"
            type="button"
            class="btn btn-secondary"
            @click="clearHolders"
          >
            {{
              confirmClear
                ? `Точно освободить все точки дня ${day} для всех?`
                : 'Освободить все точки дня'
            }}
          </button>
        </div>

        <div class="card rise-in" style="--i: 4">
          <h2>Всего за {{ daysCount }} {{ plural(daysCount, ['день', 'дня', 'дней']) }}</h2>
          <ul class="legend">
            <li
              v-for="row in totals.rows"
              :key="row.id"
              :class="{ leader: row.id === totals.leader }"
            >
              <span class="dot" :style="{ background: row.color }" />
              <span class="legend-name">
                {{ row.name || 'Без имени' }}{{ row.id === totals.leader ? ' 👑' : '' }}
              </span>
              <span class="legend-sum">{{ fmt(row.sum) }}</span>
              <span
                class="bar"
                :style="{ width: `${shareOfMax(row.sum)}%`, background: row.color }"
              />
            </li>
          </ul>
          <p class="hint small">Сумма очков по всем дням: каждый день — по точкам того дня</p>
          <button
            v-if="!editing && map.isOwner && daysCount > 1"
            type="button"
            class="btn btn-secondary danger"
            :disabled="dayBusy"
            @click="removeLastDay"
          >
            {{
              confirmRemoveDay
                ? `Точно удалить день ${daysCount} для всех?`
                : `Удалить последний день (${daysCount})`
            }}
          </button>
        </div>

        <div v-if="activityRows.length" class="card rise-in" style="--i: 5">
          <h2>Только что</h2>
          <ul class="activity">
            <li v-for="a in activityRows" :key="a.key">
              <span class="hint small"
                >{{ a.time }}<template v-if="daysCount > 1"> · д{{ a.day }}</template></span
              >
              <span>
                <b>{{ a.point }}</b> →
                <template v-if="a.holder">
                  <span class="dot inline" :style="{ background: a.holder.color }" />
                  {{ a.holder.name }}
                </template>
                <template v-else>свободна</template>
              </span>
              <span v-if="a.by" class="hint small">{{ a.by }}</span>
            </li>
          </ul>
        </div>
      </aside>
    </div>

    <div v-if="selectedPoint && map" class="sheet" :class="{ 'over-fullscreen': fullscreen }">
      <template v-if="draft">
        <div class="sheet-head">
          <h3>Точка</h3>
          <button
            type="button"
            class="icon-btn plain"
            aria-label="Готово"
            @click="selectedId = null"
          >
            ✓
          </button>
        </div>
        <div class="types">
          <button
            v-for="t in TYPE_KEYS"
            :key="t"
            type="button"
            :class="{ active: selectedPoint.type === t }"
            @click="setPointType(selectedPoint, t)"
          >
            <b>{{ t }}</b>
          </button>
        </div>
        <div class="row">
          <input
            v-model="selectedPoint.name"
            class="input name"
            type="text"
            maxlength="20"
            placeholder="Название"
          />
          <input
            :value="selectedPoint.reward"
            class="input score"
            type="number"
            inputmode="numeric"
            min="0"
            aria-label="Очков к сбросу"
            @input="selectedPoint.reward = clean(($event.target as HTMLInputElement).value)"
          />
        </div>
        <p class="hint small">Сколько очков точка даёт к сбросу тому, кто на ней сидит</p>
        <button
          type="button"
          class="btn btn-secondary danger"
          @click="deletePoint(selectedPoint.id)"
        >
          Удалить точку
        </button>
      </template>

      <template v-else>
        <div class="sheet-head">
          <h3>
            {{ selectedPoint.name || 'Точка' }}
            <span class="hint small">· {{ fmt(selectedPoint.reward) }} очков</span>
          </h3>
          <button
            type="button"
            class="icon-btn plain"
            aria-label="Закрыть"
            @click="selectedId = null"
          >
            ✕
          </button>
        </div>
        <div class="chips">
          <button
            v-for="a in layout?.alliances ?? []"
            :key="a.id"
            type="button"
            class="chip"
            :class="{ active: holderOf(selectedPoint.id) === a.id }"
            :style="{ '--chip-color': a.color }"
            @click="setHolder(selectedPoint.id, a.id)"
          >
            <span class="dot" :style="{ background: a.color }" />
            {{ a.name || 'Без имени' }}
          </button>
          <button
            type="button"
            class="chip"
            :class="{ active: holderOf(selectedPoint.id) === FREE }"
            @click="setHolder(selectedPoint.id, FREE)"
          >
            <span class="dot" />
            Свободна
          </button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.map-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* место под открытую шторку, чтобы она не закрывала низ страницы */
.map-page.sheet-open {
  padding-bottom: 260px;
}

.map-page h1 {
  margin: 0;
}

.map-grid,
.map-main,
.map-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/*
 * Десктоп: карта слева на всю ширину, легенды — липкой колонкой справа.
 * Список карт и экраны ошибок — узкой колонкой по центру, как на телефоне.
 */
@media (min-width: 1024px) {
  .map-page.list,
  .map-page > .card,
  .map-page > p.hint {
    width: 100%;
    max-width: 640px;
    margin-inline: auto;
  }

  .map-page.list > .back {
    align-self: auto;
  }

  .map-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 20px;
    align-items: start;
  }

  .map-side {
    position: sticky;
    top: 16px;
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .map-grid .viewport {
    height: max(420px, calc(100svh - 280px));
  }

  /* редактор точки — плавающей панелью над правой колонкой, а не шторкой снизу */
  .map-page.sheet-open {
    padding-bottom: 0;
  }

  .map-page .sheet {
    left: auto;
    right: max(32px, calc((100vw - 1440px) / 2 + 32px));
    bottom: 24px;
    width: 380px;
    max-height: calc(100dvh - 48px);
    overflow-y: auto;
    margin: 0;
    padding-bottom: 16px;
    border-radius: 20px;
  }
}

.map-page > .hint {
  margin: 0;
}

.back {
  align-self: flex-start;
  font-size: 14px;
}

.title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.title-row h1 {
  overflow-wrap: anywhere;
}

.presence {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--success);
}

.presence.off {
  color: var(--hint);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--secondary-bg);
}

.card h2 {
  margin: 0;
  font-size: 17px;
}

.card p {
  margin: 0;
}

.small {
  font-size: 13px;
}

.map-link {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--bg);
  color: var(--text);
  font-weight: 600;
}

.grow {
  flex: 1;
}

.toolbar,
.zoom-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.zoom-bar {
  gap: 4px;
}

.day-bar {
  display: flex;
  align-items: center;
  gap: 4px;
}

.day-label {
  min-width: 92px;
  text-align: center;
  white-space: nowrap;
}

.spacer {
  flex: 1;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 4px;
}

.small-btn {
  width: auto;
  min-height: 40px;
  padding: 8px 12px;
  font-size: 14px;
}

.input {
  min-width: 0;
  min-height: 44px;
  padding: 10px 12px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: var(--bg);
  color: var(--text);
  /* 16px+: иначе iOS зумит страницу при фокусе */
  font: inherit;
  font-size: 17px;
  outline: none;
}

.input:focus {
  border-color: var(--accent);
}

.input.name {
  flex: 1;
}

.input.score {
  width: 110px;
  flex: none;
}

.segmented,
.types {
  display: grid;
  gap: 6px;
}

.segmented.two {
  grid-template-columns: 1fr 1fr;
}

.types {
  grid-template-columns: repeat(5, 1fr);
}

.base-pick {
  display: flex;
  align-items: center;
  gap: 8px;
}

.base-pick select {
  flex: 1;
  min-width: 0;
}

.segmented button,
.types button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 6px 2px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.types button span {
  font-size: 11px;
  color: var(--hint);
}

.segmented button.active,
.types button.active {
  border-color: var(--accent);
}

/*
 * Высота фиксированная: dvh меняется вместе с панелями браузера и при растягивании
 * Telegram, и карта прыгала под пальцем. svh — стабильная высота, в Telegram — его своя.
 */
.viewport {
  overflow: auto;
  height: calc(var(--tg-viewport-stable-height, 100svh) * 0.7);
  border-radius: 12px;
  background: var(--bg);
  overscroll-behavior: contain;
}

.map-stage {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* карта поверх всего; отступы — под вырезы экрана и кнопки Telegram */
.map-stage.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 20;
  gap: 6px;
  padding: calc(8px + var(--inset-top, 0px)) calc(8px + var(--inset-right, 0px))
    calc(8px + var(--inset-bottom, 0px)) calc(8px + var(--inset-left, 0px));
  background: var(--secondary-bg);
  animation: pop-in 0.2s var(--ease-out, ease) both;
}

.map-stage.fullscreen .zoom-bar {
  flex-wrap: nowrap;
}

.map-stage.fullscreen .viewport {
  flex: 1;
  min-height: 0;
  height: auto;
}

/* анимация карточки с translate сделала бы её контейнером для position: fixed */
.card.has-fullscreen {
  animation: none;
}

.day-label.compact {
  min-width: 0;
  padding: 0 4px;
}

.close-full {
  font-weight: 700;
}

:global(html.map-fullscreen),
:global(html.map-fullscreen body) {
  overflow: hidden;
}

.surface {
  position: relative;
  /* размеры точек — в cqw: точки растут вместе с масштабом карты */
  container-type: inline-size;
  background-color: #fff;
  background-image:
    linear-gradient(rgb(0 0 0 / 6%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(0 0 0 / 6%) 1px, transparent 1px);
  /* сетка 80×80 */
  background-size: 1.25% 1.25%;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.surface.has-image {
  background-image: none;
}

.surface.editing {
  cursor: crosshair;
}

.surface.linking {
  cursor: default;
}

.surface-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.surface-image.faded {
  opacity: 0.55;
}

.surface-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 0 24px;
  text-align: center;
  pointer-events: none;
}

.links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.links line {
  stroke: #333;
  stroke-width: 1.5;
}

/* направляющая магнита: тоньше и пунктиром, чтобы не путать со связью */
.links line.guide {
  stroke: #ec4f97;
  stroke-width: 1;
  stroke-dasharray: 4 3;
}

.snap-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.snap-row .grow {
  flex: 1;
  margin: 0;
}

.snap-toggle {
  flex-shrink: 0;
}

.snap-toggle:not(.active) {
  opacity: 0.6;
}

.point {
  --point-color: #fff;
  position: absolute;
  width: var(--size);
  height: var(--size);
  /* тап-зона не меньше 24px даже на общем плане */
  min-width: 24px;
  min-height: 24px;
  transform: translate(-50%, -50%);
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.surface.editing .point {
  cursor: grab;
  touch-action: none;
}

.surface.linking .point {
  cursor: pointer;
}

.point-body {
  position: absolute;
  inset: 0;
  background: var(--point-color);
  border: 0.16cqw solid #444;
  box-shadow: 0 0.13cqw 0.4cqw rgb(0 0 0 / 30%);
  transition:
    transform 0.15s var(--ease-spring, ease),
    background-color 0.3s ease;
}

.point.diamond .point-body {
  transform: rotate(45deg) scale(0.78);
}

.point.circle .point-body {
  border-radius: 50%;
}

.point.selected .point-body {
  outline: 0.33cqw solid var(--accent);
  outline-offset: 0.2cqw;
}

.point.diamond.selected .point-body {
  transform: rotate(45deg) scale(0.9);
}

.point.square.selected .point-body,
.point.circle.selected .point-body {
  transform: scale(1.12);
}

.point-text {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #111;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.point-name {
  font-size: 0.62cqw;
  font-weight: 600;
  opacity: 0.8;
}

.point-reward {
  font-size: 0.75cqw;
  font-weight: 800;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.actions .danger {
  grid-column: 1 / -1;
}

.danger {
  color: var(--danger);
}

.conflict {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg);
  border-left: 4px solid var(--danger);
}

.legend,
.activity {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend li {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 12px;
  border-radius: 12px;
  background: var(--bg);
  overflow: hidden;
}

.legend li.leader {
  box-shadow: inset 0 0 0 2px var(--success);
}

.legend-name {
  flex: 1;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.legend-name .hint {
  font-weight: 400;
}

.legend-sum {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 4px;
  transition: width 0.3s var(--ease-out, ease);
}

.activity li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
}

.activity li > span:nth-child(2) {
  flex: 1;
}

.dot {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px dashed var(--hint);
}

.dot[style] {
  border: 0;
}

.dot.inline {
  display: inline-block;
  width: 10px;
  height: 10px;
  vertical-align: baseline;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color {
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: none;
  cursor: pointer;
}

.icon-btn {
  flex: none;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: var(--bg);
  color: var(--danger);
  font: inherit;
  font-size: 18px;
  cursor: pointer;
}

.icon-btn.plain {
  background: none;
  color: var(--text);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px calc(16px + var(--inset-bottom, 0px));
  border-radius: 20px 20px 0 0;
  background: var(--secondary-bg);
  box-shadow: 0 -6px 24px rgb(0 0 0 / 25%);
  animation: rise-in 0.25s var(--ease-out, ease) both;
}

.sheet.over-fullscreen {
  z-index: 30;
}

.sheet h3 {
  margin: 0;
  font-size: 16px;
}

.sheet p {
  margin: 0;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  --chip-color: var(--hint);
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 14px;
  border: 2px solid transparent;
  border-radius: 22px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.chip.active {
  border-color: var(--chip-color);
}
</style>

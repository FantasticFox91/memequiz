<script setup lang="ts">
import {
  OIL_DAY_MINUTES,
  OIL_FREE,
  OIL_TOWERS,
  OIL_US,
  type OilEnemy,
  type OilHolder,
  type OilTowerType,
  analyzeOil,
  formatOilClock,
  formatOilMinutes,
  oilCycle,
  oilElapsed,
  oilIsMoscowZone,
  oilMaxPerDay,
  oilRate,
} from '~/utils/oil';

useHead({ title: 'Нефть · MemeQuiz' });

const STORAGE_KEY = 'oil-calc';

interface OilState {
  tower: OilTowerType;
  holders: OilHolder[];
  // очки введены на момент updatedAt (мс); дальше растут сами по занятым точкам
  ourScore: number;
  enemies: OilEnemy[];
  updatedAt: number;
}

function initialState(): OilState {
  return {
    tower: 'm',
    holders: OIL_TOWERS.m.rates.map(() => OIL_FREE),
    ourScore: 0,
    enemies: [{ id: 'e1', name: 'Враг 1', score: 0 }],
    updatedAt: Date.now(),
  };
}

const state = reactive<OilState>(initialState());

// время считаем по часам пользователя; очки начисляются раз в минуту, тикаем чаще
const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  const saved = readStorage<OilState>(STORAGE_KEY);
  if (saved && OIL_TOWERS[saved.tower]) {
    const { tower, holders, ourScore, enemies, updatedAt } = saved;
    Object.assign(state, { tower, holders, ourScore, enemies, updatedAt: updatedAt ?? Date.now() });
  }
  now.value = new Date();
  timer = setInterval(() => (now.value = new Date()), 5_000);
});
onUnmounted(() => clearInterval(timer));
watch(state, (value) => writeStorage(STORAGE_KEY, value), { deep: true });

const rates = computed(() => OIL_TOWERS[state.tower].rates);
const maxPerDay = computed(() => oilMaxPerDay(rates.value));

// пустое поле или мусор — 0, без отрицательных и дробных
function clean(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(n, 0) : 0;
}

// начисление с момента ввода: каждая сторона получает очки своих точек за прошедшие минуты
const elapsed = computed(() => oilElapsed(new Date(state.updatedAt), now.value));

function liveScore(base: number, side: string): number {
  const start = elapsed.value.reset ? 0 : clean(base);
  return start + oilRate(rates.value, state.holders, side) * elapsed.value.minutes;
}

const ourLive = computed(() => liveScore(state.ourScore, OIL_US));
const enemiesLive = computed(() =>
  state.enemies.map((e) => ({ ...e, score: liveScore(e.score, e.id) })),
);

// перед любым изменением фиксируем набежавшие очки, чтобы новое считалось с этого момента
function commit() {
  const at = new Date();
  state.ourScore = ourLive.value;
  enemiesLive.value.forEach((e, i) => (state.enemies[i]!.score = e.score));
  state.updatedAt = at.getTime();
  now.value = at;
}

/*
 * Пока поле в фокусе, показываем введённый текст, а не живой счёт: иначе тик таймера
 * перерисовывает страницу и Vue возвращает в поле старое значение посреди ввода.
 */
const drafts = reactive<Record<string, string>>({});

function shown(key: string, live: number | undefined): string | number | undefined {
  return key in drafts ? drafts[key] : live;
}

function setDraft(key: string, event: Event) {
  drafts[key] = (event.target as HTMLInputElement).value;
}

function dropDraft(key: string) {
  delete drafts[key];
}

// очищенное значение возвращаем в поле: если computed не изменился, Vue сам его не перерисует
function setOurScore(input: HTMLInputElement) {
  commit();
  state.ourScore = clean(input.value);
  input.value = String(state.ourScore);
  dropDraft(OIL_US);
}

function setEnemyScore(index: number, input: HTMLInputElement) {
  commit();
  const enemy = state.enemies[index]!;
  enemy.score = clean(input.value);
  input.value = String(enemy.score);
  dropDraft(enemy.id);
}

function setHolder(point: number, holder: OilHolder) {
  commit();
  state.holders[point] = holder;
}

function selectTower(type: OilTowerType) {
  if (state.tower === type) return;
  commit();
  state.tower = type;
  state.holders = OIL_TOWERS[type].rates.map(() => OIL_FREE);
}

let enemySeq = 1;
function addEnemy() {
  commit();
  while (state.enemies.some((e) => e.id === `e${enemySeq}`)) enemySeq++;
  state.enemies.push({ id: `e${enemySeq}`, name: `Враг ${state.enemies.length + 1}`, score: 0 });
}

function removeEnemy(id: string) {
  commit();
  state.enemies = state.enemies.filter((e) => e.id !== id);
  state.holders = state.holders.map((h) => (h === id ? OIL_FREE : h));
}

function reset() {
  Object.assign(state, initialState());
  now.value = new Date();
}

const cycle = computed(() => oilCycle(now.value));
const minutesLeft = computed(() => cycle.value.minutesLeft);

// «через 2 ч 10 мин (до 14:35)»
function inTime(minutes: number): string {
  const at = new Date(now.value.getTime() + minutes * 60_000);
  return `через ${formatOilMinutes(minutes)} (до ${formatOilClock(at)})`;
}

const analysis = computed(() =>
  analyzeOil({
    rates: rates.value,
    holders: state.holders,
    ourScore: ourLive.value,
    enemies: enemiesLive.value,
    minutesLeft: minutesLeft.value,
  }),
);

const hold = computed(() => analysis.value.hold);

// потолок каждого врага: прямо сейчас займёт все точки и удержит до сброса
const enemyCeilings = computed(() => {
  const gain = totalRate.value * minutesLeft.value;
  return analysis.value.enemies.map((e) => ({
    id: e.id,
    name: e.name || 'Враг',
    score: e.score + gain,
  }));
});
const totalRate = computed(() => rates.value.reduce((sum, r) => sum + r, 0));

// сколько времени не хватает до сброса, чтобы досидеть до гарантии (0 — успеваем, null — точек нет)
const timeShort = computed(() =>
  hold.value.minutes === null ? null : Math.max(hold.value.minutes - minutesLeft.value, 0),
);
const goalOk = computed(() => timeShort.value === 0);

function finishAt(minutes: number): string {
  return formatOilClock(new Date(now.value.getTime() + minutes * 60_000));
}

function holdStatus(minutes: number | null): string {
  if (minutes === null) return '—';
  if (!minutes) return 'можно уходить ✓';
  return minutes <= minutesLeft.value ? `в ${finishAt(minutes)}` : 'не успеть';
}

const overMax = computed(
  () => ourLive.value > maxPerDay.value || enemiesLive.value.some((e) => e.score > maxPerDay.value),
);

function holderName(holder: OilHolder): string {
  if (holder === OIL_US) return 'нас';
  if (holder === OIL_FREE) return 'никого';
  return state.enemies.find((e) => e.id === holder)?.name || 'врага';
}

function pointLabel(point: number): string {
  return `точка ${point + 1} (${rates.value[point]}/мин)`;
}

function enemyNames(ids: string[]): string {
  return ids.map((id) => holderName(id)).join(', ');
}

const fmt = (n: number) => n.toLocaleString('ru-RU');
// «02:50 МСК (у тебя 00:50)»; если пользователь сам в Москве — просто «02:50»
const inMoscow = computed(() => oilIsMoscowZone(now.value));
function mskLabel(msk: string, local: Date): string {
  return inMoscow.value ? msk : `${msk} МСК (у тебя ${formatOilClock(local)})`;
}
</script>

<template>
  <section class="oil">
    <h1 class="rise-in">Нефть</h1>
    <p class="hint rise-in" style="--i: 1">
      Вышку забирает союз, набравший больше всех очков к сбросу. Очки сбрасываются в 02:50 по
      Москве. Всё время на странице — по твоему часовому поясу.
    </p>
    <NuxtLink to="/map" class="btn btn-secondary rise-in" style="--i: 1">
      🗺 Карта нефти: свои карты и итог по союзам
    </NuxtLink>

    <div class="card rise-in" style="--i: 2">
      <h2>Вышка</h2>
      <div class="segmented">
        <button
          v-for="(info, type) in OIL_TOWERS"
          :key="type"
          type="button"
          :class="{ active: state.tower === type }"
          @click="selectTower(type)"
        >
          <span class="seg-title">{{ info.label }}</span>
          <span class="seg-sub">{{ info.rates.length }} точки</span>
        </button>
      </div>
      <p class="hint small">
        {{ rates.reduce((s, r) => s + r, 0) }} очк./мин со всех точек · максимум
        {{ fmt(maxPerDay) }} за сутки
      </p>
    </div>

    <div class="card rise-in" style="--i: 3">
      <h2>До сброса</h2>
      <p class="countdown">
        {{ formatOilMinutes(minutesLeft) }}
        <span class="hint small">сброс в {{ mskLabel('02:50', cycle.endsAt) }}</span>
      </p>
      <p v-if="cycle.paused" class="hint small">
        Сейчас перерыв, новый цикл начнётся в {{ mskLabel('03:00', cycle.startsAt) }}: считаем на
        весь следующий цикл
      </p>
      <p v-else class="hint small">
        Цикл идёт с 03:00 до 02:50 по Москве<template v-if="!inMoscow">
          (у тебя с {{ formatOilClock(cycle.startsAt) }} до {{ formatOilClock(cycle.endsAt) }})</template>
      </p>
    </div>

    <div class="card rise-in" style="--i: 4">
      <h2>Очки сейчас</h2>
      <p class="hint small">
        Введи очки из игры: дальше они растут сами каждую минуту по занятым точкам.
      </p>
      <p v-if="elapsed.reset" class="hint small">
        Был сброс в 02:50 МСК: старые очки обнулены, счёт идёт с 03:00 МСК.
      </p>
      <div class="side">
        <span class="side-name us">Мы</span>
        <span class="rate-badge">+{{ oilRate(rates, state.holders, OIL_US) }}/мин</span>
        <input
          :value="shown(OIL_US, ourLive)"
          class="input score"
          type="number"
          inputmode="numeric"
          min="0"
          @input="setDraft(OIL_US, $event)"
          @blur="dropDraft(OIL_US)"
          @change="setOurScore($event.target as HTMLInputElement)"
        />
      </div>
      <div v-for="(enemy, i) in state.enemies" :key="enemy.id" class="side">
        <input
          v-model="enemy.name"
          class="input name"
          type="text"
          maxlength="24"
          placeholder="Союз"
        />
        <span class="rate-badge">+{{ oilRate(rates, state.holders, enemy.id) }}/мин</span>
        <input
          :value="shown(enemy.id, enemiesLive[i]?.score)"
          class="input score"
          type="number"
          inputmode="numeric"
          min="0"
          @input="setDraft(enemy.id, $event)"
          @blur="dropDraft(enemy.id)"
          @change="setEnemyScore(i, $event.target as HTMLInputElement)"
        />
        <button
          type="button"
          class="icon-btn"
          aria-label="Удалить врага"
          @click="removeEnemy(enemy.id)"
        >
          ✕
        </button>
      </div>
      <button type="button" class="btn btn-secondary" @click="addEnemy">+ Добавить врага</button>
      <p v-if="overMax" class="error-text">
        Больше {{ fmt(maxPerDay) }} за сутки на этой вышке набрать нельзя: проверь очки
      </p>
    </div>

    <div class="card rise-in" style="--i: 5">
      <h2>Кто на точках</h2>
      <div v-for="(rate, i) in rates" :key="`${state.tower}-${i}`" class="side">
        <span class="point-name">
          Точка {{ i + 1 }}
          <span class="hint small">{{ rate }}/мин · {{ fmt(rate * OIL_DAY_MINUTES) }}/сутки</span>
        </span>
        <select
          :value="state.holders[i]"
          class="input select"
          @change="setHolder(i, ($event.target as HTMLSelectElement).value)"
        >
          <option :value="OIL_FREE">Свободна</option>
          <option :value="OIL_US">Мы</option>
          <option v-for="enemy in state.enemies" :key="enemy.id" :value="enemy.id">
            {{ enemy.name || 'Враг' }}
          </option>
        </select>
      </div>
    </div>

    <div class="card result rise-in" :class="analysis.win ? 'win' : 'lose'" style="--i: 6">
      <h2 class="verdict">
        {{ analysis.win ? '✅ Забираем вышку' : '❌ Сейчас вышку не забираем' }}
      </h2>
      <p class="hint small">
        Прогноз к сбросу через {{ formatOilMinutes(minutesLeft) }}, если точки никто не перехватит
      </p>

      <table class="forecast">
        <thead>
          <tr>
            <th>Союз</th>
            <th>Сейчас</th>
            <th>/мин</th>
            <th>Наберёт</th>
            <th>К сбросу</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="side in [analysis.us, ...analysis.enemies]"
            :key="side.id"
            :class="{ us: side.id === OIL_US }"
          >
            <td>{{ side.name || 'Враг' }}</td>
            <td>{{ fmt(side.score) }}</td>
            <td>{{ side.rate }}</td>
            <td>+{{ fmt(side.final - side.score) }}</td>
            <td class="final">{{ fmt(side.final) }}</td>
          </tr>
        </tbody>
      </table>

      <dl class="stats secure">
        <div>
          <dt>Минимум для 100%, если уйти сейчас</dt>
          <dd>{{ fmt(analysis.secureNow) }}</dd>
        </div>
        <div>
          <dt>Не хватает, если уйти сейчас</dt>
          <dd :class="analysis.us.score >= analysis.secureNow ? 'good' : 'bad'">
            {{
              analysis.us.score >= analysis.secureNow
                ? 'набрано ✓'
                : fmt(analysis.secureNow - analysis.us.score)
            }}
          </dd>
        </div>
      </dl>

      <div class="secure-table">
        <h3>Как добрать до 100% при разных очках в минуту</h3>
        <table class="forecast rates">
          <thead>
            <tr>
              <th>/мин</th>
              <th>Точки</th>
              <th>Сидеть</th>
              <th>Ещё очков</th>
              <th>Итого</th>
              <th>Уйти</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="o in analysis.holdOptions"
              :key="o.rate"
              :class="{ us: o.current, miss: o.minutes === null || o.minutes > minutesLeft }"
            >
              <td>{{ o.rate }}{{ o.current ? ' ←' : '' }}</td>
              <td>{{ o.points.map((p) => p + 1).join(' + ') }}</td>
              <td>{{ o.minutes === null ? '—' : formatOilMinutes(o.minutes) }}</td>
              <td class="final">{{ o.minutes ? `+${fmt(o.toGo)}` : '—' }}</td>
              <td>{{ o.minutes ? fmt(o.target) : '—' }}</td>
              <td>{{ holdStatus(o.minutes) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="goal" :class="goalOk ? 'good' : 'bad'">
        <h3>Цель</h3>
        <p class="hint small">
          Сколько сидеть, чтобы вышка осталась нашей, даже если после нашего ухода враг займёт всю
          вышку (+{{ totalRate }}/мин) до сброса.
        </p>
        <dl class="stats">
          <div>
            <dt>Сидеть ещё (+{{ analysis.us.rate }}/мин)</dt>
            <dd :class="timeShort === 0 ? 'good' : 'bad'">
              {{
                hold.minutes === null
                  ? '∞ (нет точек)'
                  : hold.minutes
                    ? formatOilMinutes(hold.minutes)
                    : 'можно уходить ✓'
              }}
            </dd>
          </div>
          <div v-if="hold.minutes">
            <dt>Должно быть у нас к уходу</dt>
            <dd>{{ fmt(hold.target) }}</dd>
          </div>
          <div v-for="e in enemyCeilings" :key="e.id">
            <dt>Максимум {{ e.name }}, если займёт всю вышку сейчас (+{{ totalRate }}/мин)</dt>
            <dd>{{ fmt(e.score) }}</dd>
          </div>
          <div>
            <dt>У нас сейчас</dt>
            <dd>{{ fmt(analysis.us.score) }}</dd>
          </div>
          <div v-if="hold.minutes !== null">
            <dt>Не хватает очков</dt>
            <dd :class="hold.toGo ? 'bad' : 'good'">
              {{ hold.toGo ? fmt(hold.toGo) : 'хватает ✓' }}
            </dd>
          </div>
          <div>
            <dt>До сброса</dt>
            <dd>{{ formatOilMinutes(minutesLeft) }}</dd>
          </div>
          <div v-if="hold.minutes">
            <dt>Не хватает времени</dt>
            <dd :class="timeShort ? 'bad' : 'good'">
              {{ timeShort ? formatOilMinutes(timeShort) : 'успеваем ✓' }}
            </dd>
          </div>
        </dl>

        <p class="conclusion">
          <template v-if="hold.minutes === 0">
            Очков уже хватает: вышка наша, даже если сейчас уйти и враг займёт всю вышку.
          </template>
          <template v-else-if="hold.minutes === null">
            Мы не держим точек: без них не набрать. Займите точки — сколько сидеть, смотри в
            таблице.
          </template>
          <template v-else-if="timeShort === 0">
            Сидеть ещё {{ formatOilMinutes(hold.minutes) }} (до {{ finishAt(hold.minutes) }}), чтобы
            было {{ fmt(hold.target) }} — после этого вышка наша при любом раскладе.
          </template>
          <template v-else>
            Гарантировать не успеваем: нужно {{ formatOilMinutes(hold.minutes) }}, а до сброса
            {{ formatOilMinutes(minutesLeft) }}. Держите точки до сброса:
            {{
              analysis.win
                ? 'по текущему раскладу вышка наша, если не отдать точки.'
                : `по текущему раскладу не хватит ${fmt(analysis.shortfall)} — смотри тактики ниже.`
            }}
          </template>
        </p>
      </div>

      <p v-if="!analysis.win" class="hint small">Ничья не засчитывается: нужно строго больше.</p>

      <template v-if="analysis.win">
        <template v-if="analysis.threats.length">
          <h3>Что держать</h3>
          <ul class="list">
            <li v-for="t in analysis.threats" :key="t.point">
              Если {{ enemyNames(t.enemyIds) }} заберёт {{ pointLabel(t.point) }} сейчас — проиграем
            </li>
          </ul>
        </template>
        <p v-else class="hint small">Даже потеря любой одной точки сейчас не меняет результат</p>
      </template>

      <template v-else>
        <template v-if="analysis.tactics.length">
          <h3>Как забрать</h3>
          <ol class="list">
            <li v-for="(tactic, i) in analysis.tactics" :key="i" class="tactic">
              <span>
                Забрать
                <template v-for="(c, j) in tactic.captures" :key="c.point">
                  {{ j ? ', ' : '' }}{{ pointLabel(c.point) }} у {{ holderName(c.from) }}
                </template>
              </span>
              <span class="hint small">
                {{
                  tactic.deadline === 0 ? 'прямо сейчас' : `не позже чем ${inTime(tactic.deadline)}`
                }}
                · запас {{ fmt(tactic.margin) }} при захвате сразу
              </span>
            </li>
          </ol>
        </template>

        <template v-else>
          <p>
            Сегодня не забрать: даже со всеми точками прямо сейчас не хватит
            <b>{{ fmt(analysis.missingWithAll ?? 0) }}</b
            >.
          </p>
          <p class="hint small">
            После сброса все начинают с нуля: займите точки сразу после сброса и держите больше
            очков в минуту, чем любой враг.
          </p>
        </template>
      </template>
    </div>

    <button type="button" class="btn btn-secondary rise-in" style="--i: 7" @click="reset">
      Сбросить всё
    </button>
  </section>
</template>

<style scoped>
.oil {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.oil h1 {
  margin: 0;
}

.oil > .hint {
  margin: 0;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 2px solid transparent;
  border-radius: 16px;
  background: var(--secondary-bg);
}

.card h2 {
  margin: 0;
  font-size: 17px;
}

.card h3 {
  margin: 4px 0 0;
  font-size: 15px;
}

.card p {
  margin: 0;
}

.small {
  font-size: 13px;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.segmented button {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 4px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.segmented button.active {
  border-color: var(--accent);
}

.seg-title {
  font-size: 18px;
  font-weight: 700;
}

.seg-sub {
  font-size: 13px;
  color: var(--hint);
}

.countdown {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.countdown .hint {
  font-weight: 400;
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

.side {
  display: flex;
  align-items: center;
  gap: 8px;
}

.side-name {
  flex: 1;
  font-weight: 700;
}

.side-name.us {
  color: var(--accent);
}

.input.name {
  flex: 1;
}

.input.score {
  width: 100px;
  flex: none;
}

.rate-badge {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--hint);
  font-variant-numeric: tabular-nums;
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
  cursor: pointer;
}

.point-name {
  flex: 1;
  display: flex;
  flex-direction: column;
  font-weight: 600;
}

.point-name .hint {
  font-weight: 400;
}

.input.select {
  width: 150px;
  flex: none;
}

.result.win {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
}

.result.lose {
  border-color: color-mix(in srgb, var(--danger) 45%, transparent);
}

.forecast {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.forecast th {
  font-weight: 600;
  color: var(--hint);
  text-align: right;
  padding: 4px;
}

.forecast td {
  text-align: right;
  padding: 4px;
}

.forecast th:first-child,
.forecast td:first-child {
  text-align: left;
  overflow-wrap: anywhere;
}

.forecast tr.us td {
  color: var(--accent);
  font-weight: 600;
}

.forecast .final {
  font-weight: 700;
}

.stats {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

.stats > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.stats dt {
  color: var(--hint);
}

.stats dd {
  margin: 0;
  font-weight: 700;
}

.secure-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stats.secure {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg);
}

.stats .good {
  color: var(--success);
}

.stats .bad {
  color: var(--danger);
}

.goal {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg);
  border-left: 4px solid var(--hint);
}

.goal h3 {
  margin: 0;
}

.goal.good {
  border-left-color: var(--success);
}

.goal.bad {
  border-left-color: var(--danger);
}

.forecast.rates th:nth-child(2),
.forecast.rates td:nth-child(2) {
  text-align: center;
}

.forecast.rates {
  font-size: 13px;
}

.forecast.rates th,
.forecast.rates td {
  padding: 4px 2px;
}

.forecast.rates tr.miss td {
  color: var(--danger);
}

.forecast.rates tr.miss td:first-child {
  color: inherit;
}

.conclusion {
  font-weight: 600;
}

.list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tactic > span {
  display: block;
}

.tactic::marker {
  font-weight: 700;
}
</style>

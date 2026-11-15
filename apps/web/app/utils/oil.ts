// Калькулятор нефтяной вышки: кто наберёт больше очков к сбросу (раз в сутки), тот забирает вышку

export type OilTowerType = 'm' | 'l' | 'xl';

// очки в минуту для каждой точки вышки
export const OIL_TOWERS: Record<OilTowerType, { label: string; rates: number[] }> = {
  m: { label: 'M', rates: [1, 2] },
  l: { label: 'L', rates: [1, 1, 2] },
  xl: { label: 'XL', rates: [1, 1, 2, 2] },
};

// цикл по московскому времени: очки идут с 03:00 до 02:50 следующего дня, с 02:50 до 03:00 — перерыв
const CYCLE_START_HOUR = 3;
const CYCLE_END_HOUR = 2;
const CYCLE_END_MINUTE = 50;
export const OIL_DAY_MINUTES = 23 * 60 + 50;

export interface OilCycle {
  minutesLeft: number;
  endsAt: Date;
  // ближайшее начало цикла (03:00 МСК)
  startsAt: Date;
  // перерыв 02:50–03:00 МСК: текущий цикл закончен, следующий ещё не начался
  paused: boolean;
}

// сервер игры живёт по Москве: UTC+3 круглый год, без перехода на летнее время
const MSK_OFFSET_MS = 3 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

// момент hh:mm по Москве в тот же московский день, что и now
function mskTime(now: Date, hour: number, minute: number): Date {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const utc = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate(), hour, minute);
  return new Date(utc - MSK_OFFSET_MS);
}

// цикл считается по Москве, время показываем в часовом поясе пользователя
export function oilCycle(now: Date): OilCycle {
  let end = mskTime(now, CYCLE_END_HOUR, CYCLE_END_MINUTE);
  const start = mskTime(now, CYCLE_START_HOUR, 0);

  if (now >= end && now < start) {
    return {
      minutesLeft: OIL_DAY_MINUTES,
      endsAt: new Date(end.getTime() + DAY_MS),
      startsAt: start,
      paused: true,
    };
  }
  if (now >= start) end = new Date(end.getTime() + DAY_MS);
  // неполная минута ещё впереди: очко за неё начислится ровно на границе минуты
  const minutesLeft = Math.ceil((end.getTime() - now.getTime()) / 60_000);
  return {
    minutesLeft: Math.min(minutesLeft, OIL_DAY_MINUTES),
    endsAt: end,
    // начало следующего цикла: через 10 минут после сброса
    startsAt: new Date(end.getTime() + 10 * 60_000),
    paused: false,
  };
}

/*
 * Сколько минут шли очки с from до to (перерыв не считается).
 * reset — между ними был сброс: старые очки обнулены, minutes считаются с 03:00 текущего цикла.
 */
export function oilElapsed(from: Date, to: Date): { minutes: number; reset: boolean } {
  const a = oilCycle(from);
  const b = oilCycle(to);
  if (a.endsAt.getTime() !== b.endsAt.getTime()) {
    return { minutes: OIL_DAY_MINUTES - b.minutesLeft, reset: true };
  }
  return { minutes: Math.max(a.minutesLeft - b.minutesLeft, 0), reset: false };
}

export function oilRate(rates: number[], holders: OilHolder[], side: string): number {
  return rateOf(rates, holders, side);
}

// «14:05» в часовом поясе пользователя
export function formatOilClock(date: Date): string {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// пользователь сейчас живёт по Москве: тогда «МСК» дублировать не нужно
export function oilIsMoscowZone(now: Date): boolean {
  return -now.getTimezoneOffset() * 60_000 === MSK_OFFSET_MS;
}

// владелец точки: мы, никто или id врага
export const OIL_US = 'us';
export const OIL_FREE = 'free';
export type OilHolder = string;

export interface OilEnemy {
  id: string;
  name: string;
  score: number;
}

export interface OilInput {
  rates: number[];
  holders: OilHolder[];
  ourScore: number;
  enemies: OilEnemy[];
  minutesLeft: number;
}

export interface OilForecast {
  id: string;
  name: string;
  score: number;
  rate: number;
  final: number;
}

export interface OilCapture {
  point: number;
  from: OilHolder;
}

export interface OilTactic {
  captures: OilCapture[];
  // захватить не позже чем через столько минут
  deadline: number;
  // отрыв от ближайшего врага к сбросу, если захватить сразу
  margin: number;
}

export interface OilThreat {
  point: number;
  enemyIds: string[];
}

/*
 * Гарантированный захват: сидим d минут, потом уходим, и худший случай — любой враг
 * занимает всю вышку до сброса. Вышка наша, если наши очки к моменту ухода больше,
 * чем враг успеет набрать к сбросу.
 */
export interface OilHold {
  // сколько ещё сидеть (0 — можно уходить; может быть больше времени до сброса; null — без точек не набрать)
  minutes: number | null;
  // сколько у нас должно быть к моменту ухода
  target: number;
  // сколько очков ещё набрать до target
  toGo: number;
}

export interface OilHoldOption extends OilHold {
  rate: number;
  points: number[];
  current: boolean;
}

function secureHold(input: OilInput, usRate: number, enemyRates: number[]): OilHold {
  const T = input.minutesLeft;
  const total = input.rates.reduce((sum, r) => sum + r, 0);
  const s = input.ourScore;
  let minutes: number | null = 0;
  opponents(input.enemies).forEach((enemy, i) => {
    const q = enemyRates[i] ?? 0;
    // s + r·d ≥ e + q·d + total·(T − d) + 1
    const need = enemy.score + total * T + 1 - s;
    const speed = usRate - q + total;
    if (need <= 0 || minutes === null) return;
    // без своих точек очки не растут: сидеть бессмысленно
    minutes = usRate > 0 && speed > 0 ? Math.max(minutes, Math.ceil(need / speed)) : null;
  });
  const target = minutes === null ? s : s + usRate * minutes;
  return { minutes, target, toGo: target - s };
}

export interface OilAnalysis {
  us: OilForecast;
  enemies: OilForecast[];
  win: boolean;
  // наш итог минус лучший итог врагов (> 0 — забираем)
  margin: number;
  // минимум очков к сбросу, чтобы забрать вышку (лучший итог врагов + 1)
  needed: number;
  // сколько не хватает нашему итогу до needed (0 — хватает)
  shortfall: number;
  // сколько очков в минуту нужно держать с этого момента, чтобы набрать needed (null — без шансов)
  neededRate: number | null;
  // сколько очков нужно иметь прямо сейчас, чтобы вышка была наша на 100%:
  // даже если враг с этой минуты займёт всю вышку до сброса
  secureNow: number;
  // сколько сидеть на текущих точках, чтобы вышка была наша при любом раскладе после ухода
  hold: OilHold;
  // то же для каждого возможного темпа вышки
  holdOptions: OilHoldOption[];
  tactics: OilTactic[];
  // сколько очков не хватит даже с захватом всех точек прямо сейчас
  missingWithAll: number | null;
  threats: OilThreat[];
}

export function oilMaxPerDay(rates: number[]): number {
  return rates.reduce((sum, r) => sum + r, 0) * OIL_DAY_MINUTES;
}

function rateOf(rates: number[], holders: OilHolder[], side: string): number {
  return rates.reduce((sum, r, i) => (holders[i] === side ? sum + r : sum), 0);
}

// без врагов сравниваем с нулём
function opponents(enemies: OilEnemy[]): OilEnemy[] {
  return enemies.length ? enemies : [{ id: '', name: '', score: 0 }];
}

/*
 * Точки в before держатся d минут, потом (после захвата) — after до сброса.
 * Отрыв от врага: diff(d) = A + B·d, побеждаем при diff ≥ 1 для каждого врага.
 * Возвращает последнюю минуту захвата, при которой ещё побеждаем (null — не побеждаем никогда),
 * и отрыв при захвате сразу.
 */
function evaluate(input: OilInput, before: OilHolder[], after: OilHolder[]) {
  const T = input.minutesLeft;
  const usBefore = rateOf(input.rates, before, OIL_US);
  const usAfter = rateOf(input.rates, after, OIL_US);
  let deadline = T;
  let margin = Infinity;
  for (const enemy of opponents(input.enemies)) {
    const eBefore = rateOf(input.rates, before, enemy.id);
    const eAfter = rateOf(input.rates, after, enemy.id);
    const a = input.ourScore - enemy.score + (usAfter - eAfter) * T;
    const b = usBefore - eBefore - (usAfter - eAfter);
    margin = Math.min(margin, a);
    if (b < 0) deadline = Math.min(deadline, Math.floor((a - 1) / -b));
  }
  return { deadline: margin >= 1 ? deadline : null, margin };
}

function forecast(input: OilInput, id: string, name: string, score: number): OilForecast {
  const rate = rateOf(input.rates, input.holders, id);
  return { id, name, score, rate, final: score + rate * input.minutesLeft };
}

export function analyzeOil(input: OilInput): OilAnalysis {
  const us = forecast(input, OIL_US, 'Мы', input.ourScore);
  const enemies = input.enemies.map((e) => forecast(input, e.id, e.name, e.score));
  const best = enemies.reduce((max, e) => Math.max(max, e.final), 0);
  const margin = us.final - best;
  const win = margin > 0;
  const needed = best + 1;
  const shortfall = Math.max(needed - us.final, 0);
  const totalRate = input.rates.reduce((sum, r) => sum + r, 0);
  const toGain = needed - input.ourScore;
  let neededRate: number | null = 0;
  if (toGain > 0) {
    const rate = input.minutesLeft ? Math.ceil(toGain / input.minutesLeft) : Infinity;
    neededRate = rate <= totalRate ? rate : null;
  }
  const secureNow =
    Math.max(...opponents(input.enemies).map((e) => e.score + totalRate * input.minutesLeft)) + 1;

  const hold = secureHold(
    input,
    us.rate,
    enemies.map((e) => e.rate),
  );

  // каждый возможный темп: самый короткий набор точек; враги держат своё, сколько остаётся
  const bestPoints = new Map<number, number[]>();
  for (let mask = 1; mask < 1 << input.rates.length; mask++) {
    const points = input.rates.flatMap((_, i) => (mask & (1 << i) ? [i] : []));
    const rate = points.reduce((sum, i) => sum + input.rates[i]!, 0);
    const known = bestPoints.get(rate);
    if (!known || points.length < known.length) bestPoints.set(rate, points);
  }
  const holdOptions: OilHoldOption[] = [...bestPoints.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, points]) => {
      const current = rate === us.rate;
      const enemyRates = enemies.map((e) => (current ? e.rate : Math.min(e.rate, totalRate - rate)));
      return { rate, points, current, ...secureHold(input, rate, enemyRates) };
    });

  const notOurs = input.holders.flatMap((h, i) => (h === OIL_US ? [] : [i]));
  const tactics: OilTactic[] = [];
  let missingWithAll: number | null = null;

  if (!win) {
    // все наборы точек, которые можно забрать; оставляем минимальные из рабочих
    const viable: { mask: number; tactic: OilTactic }[] = [];
    for (let mask = 1; mask < 1 << notOurs.length; mask++) {
      const after = [...input.holders];
      const captures: OilCapture[] = [];
      notOurs.forEach((point, bit) => {
        if (mask & (1 << bit)) {
          captures.push({ point, from: input.holders[point]! });
          after[point] = OIL_US;
        }
      });
      const result = evaluate(input, input.holders, after);
      if (mask === (1 << notOurs.length) - 1 && result.deadline === null) {
        missingWithAll = 1 - result.margin;
      }
      if (result.deadline !== null) {
        viable.push({ mask, tactic: { captures, deadline: result.deadline, margin: result.margin } });
      }
    }
    for (const v of viable) {
      const minimal = !viable.some((o) => o.mask !== v.mask && (o.mask & v.mask) === o.mask);
      if (minimal) tactics.push(v.tactic);
    }
    tactics.sort(
      (x, y) =>
        x.captures.length - y.captures.length || y.deadline - x.deadline || y.margin - x.margin,
    );
    if (!notOurs.length) missingWithAll = 1 - margin;
  }

  // если побеждаем: какие потери точек прямо сейчас перевернут результат
  const threats: OilThreat[] = [];
  if (win) {
    input.holders.forEach((holder, point) => {
      const enemyIds = input.enemies
        .filter((e) => e.id !== holder)
        .filter((e) => {
          const after = [...input.holders];
          after[point] = e.id;
          return evaluate(input, after, after).deadline === null;
        })
        .map((e) => e.id);
      if (enemyIds.length) threats.push({ point, enemyIds });
    });
  }

  return {
    us,
    enemies,
    win,
    margin,
    needed,
    shortfall,
    neededRate,
    secureNow,
    hold,
    holdOptions,
    tactics,
    missingWithAll,
    threats,
  };
}

// 200 → «3 ч 20 мин»
export function formatOilMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

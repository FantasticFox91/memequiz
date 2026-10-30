<script setup lang="ts">
/**
 * Админка: ручная проверка текстовых ответов. Одинаковые (после normalizeAnswer) ответы
 * разных участников собраны в одну строку, вердикт ставится всем сразу.
 * Вход по ADMIN_USERNAME / ADMIN_PASSWORD api; сессия — HttpOnly-кука, JS её не видит.
 */
import {
  type AdminAnswer,
  type AdminAnswersResponse,
  type AdminLoginRequest,
  type AdminVerdictRequest,
  normalizeAnswer,
} from '@memequiz/shared';

useHead({ title: 'Админка — MemeQuiz', meta: [{ name: 'robots', content: 'noindex' }] });

const NICKNAMES_SHOWN = 5;

type Filter = 'pending' | 'all';
type Group = {
  key: string;
  text: string;
  ids: number[];
  nicknames: string[];
  // null — у части ответов оценка другая (например, acceptedAnswers поменяли после прохождения)
  points: number | null;
  reviewed: boolean;
};

const { apiBase } = useRuntimeConfig().public;
const haptics = useHaptics();

// null — ещё не знаем (проверяем сессию первым запросом)
const authed = ref<boolean | null>(null);
const username = ref('');
const password = ref('');
const loggingIn = ref(false);
const loginError = ref<string | null>(null);

const filter = ref<Filter>('pending');
const data = ref<AdminAnswersResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
// ключи групп, по которым идёт запрос вердикта
const busy = ref(new Set<string>());

// кука сессии same-origin: уходит сама, заголовки не нужны
const api = $fetch.create({ baseURL: apiBase });

const DISABLED_TEXT = 'Админка выключена: задайте ADMIN_USERNAME и ADMIN_PASSWORD на сервере';

// сессия кончилась или админку выключили — назад к форме входа
function handleAuthError(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  if (status !== 401 && status !== 404) return false;
  authed.value = false;
  data.value = null;
  loginError.value = status === 404 ? DISABLED_TEXT : null;
  return true;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await api<AdminAnswersResponse>('/admin/answers', {
      query: { filter: filter.value },
    });
    authed.value = true;
  } catch (e) {
    if (!handleAuthError(e)) {
      error.value = apiErrorMessage(e);
      authed.value ??= true;
    }
  } finally {
    loading.value = false;
  }
}

async function login() {
  if (!username.value.trim() || !password.value || loggingIn.value) return;
  loggingIn.value = true;
  loginError.value = null;
  try {
    const body: AdminLoginRequest = { username: username.value.trim(), password: password.value };
    await api('/admin/login', { method: 'POST', body });
    password.value = '';
    await load();
  } catch (e) {
    const status = (e as { status?: number } | null)?.status;
    if (status === 404) loginError.value = DISABLED_TEXT;
    else if (status === 401) loginError.value = 'Неверный логин или пароль';
    else loginError.value = apiErrorMessage(e);
    haptics.notify('error');
  } finally {
    loggingIn.value = false;
  }
}

async function logout() {
  await api('/admin/logout', { method: 'POST' }).catch(() => undefined);
  authed.value = false;
  data.value = null;
}

async function setVerdict(group: Group, points: number) {
  if (busy.value.has(group.key)) return;
  haptics.impact('light');
  busy.value = new Set(busy.value).add(group.key);
  try {
    const body: AdminVerdictRequest = { ids: group.ids, points };
    await api('/admin/answers/verdict', { method: 'POST', body });
    // остаётся на экране и в «Непроверенных» до обновления: промах можно сразу исправить
    const ids = new Set(group.ids);
    for (const answer of data.value?.answers ?? []) {
      if (ids.has(answer.id)) Object.assign(answer, { points, reviewed: true });
    }
  } catch (e) {
    if (!handleAuthError(e)) {
      haptics.notify('error');
      error.value = apiErrorMessage(e);
    }
  } finally {
    const next = new Set(busy.value);
    next.delete(group.key);
    busy.value = next;
  }
}

function groupAnswers(answers: AdminAnswer[]): Group[] {
  const groups = new Map<string, Group & { counts: Map<string, number> }>();
  for (const answer of answers) {
    const key = `${answer.quizId}:${answer.questionId}:${normalizeAnswer(answer.text)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        text: answer.text,
        ids: [],
        nicknames: [],
        points: answer.points,
        reviewed: true,
        counts: new Map(),
      };
      groups.set(key, group);
    }
    group.ids.push(answer.id);
    group.nicknames.push(answer.nickname);
    if (group.points !== answer.points) group.points = null;
    group.reviewed &&= answer.reviewed;
    group.counts.set(answer.text, (group.counts.get(answer.text) ?? 0) + 1);
  }
  return [...groups.values()]
    .map(({ counts, ...group }) => ({
      ...group,
      // показываем самое частое написание
      text: [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? group.text,
    }))
    .sort(
      (a, b) =>
        // сначала непроверенные, среди них — частые
        Number(a.reviewed) - Number(b.reviewed) || b.ids.length - a.ids.length,
    );
}

const sections = computed(() => {
  if (!data.value) return [];
  const byQuestion = new Map<string, AdminAnswer[]>();
  // id вопросов уникальны только внутри викторины
  for (const answer of data.value.answers) {
    const key = `${answer.quizId}:${answer.questionId}`;
    byQuestion.set(key, [...(byQuestion.get(key) ?? []), answer]);
  }
  return data.value.questions
    .map((question) => ({
      question,
      groups: groupAnswers(byQuestion.get(`${question.quizId}:${question.id}`) ?? []),
    }))
    .filter((s) => s.groups.length > 0 || filter.value === 'all');
});

const pendingCount = computed(() => data.value?.answers.filter((a) => !a.reviewed).length ?? 0);

// кнопки оценки: +2 — угадано, +1 — частично (например, только исполнитель), 0 — нет
const VERDICTS = [
  { points: 2, label: '+2', tone: 'full', aria: 'Засчитать полностью, 2 балла' },
  { points: 1, label: '+1', tone: 'half', aria: 'Засчитать частично, 1 балл' },
  { points: 0, label: '✕', tone: 'none', aria: 'Отклонить, 0 баллов' },
] as const;

function statusLabel(group: Group) {
  if (group.points === null) return 'разные оценки';
  if (!group.reviewed) return `не проверен · авто ${group.points ? `+${group.points}` : '0'}`;
  return group.points ? `+${group.points}` : 'отклонён';
}

function toneClass(group: Group) {
  if (!group.reviewed || group.points === null) return null;
  return VERDICTS.find((v) => v.points === group.points)?.tone ?? null;
}

function nicknamesLabel(nicknames: string[]) {
  const shown = nicknames.slice(0, NICKNAMES_SHOWN).join(', ');
  const rest = nicknames.length - NICKNAMES_SHOWN;
  return rest > 0 ? `${shown} и ещё ${rest}` : shown;
}

watch(filter, load);
onMounted(load);
</script>

<template>
  <section class="admin">
    <div v-if="authed === null" class="center">
      <span class="spinner" aria-label="Загрузка" />
    </div>

    <form v-else-if="!authed" class="login" @submit.prevent="login">
      <h1>Админка</h1>
      <input
        v-model="username"
        class="field"
        type="text"
        placeholder="Логин"
        aria-label="Логин"
        autocomplete="username"
        autocapitalize="off"
        spellcheck="false"
      />
      <input
        v-model="password"
        class="field"
        type="password"
        placeholder="Пароль"
        aria-label="Пароль"
        autocomplete="current-password"
      />
      <p v-if="loginError" class="error-text">{{ loginError }}</p>
      <button class="btn" type="submit" :disabled="!username.trim() || !password || loggingIn">
        <span v-if="loggingIn" class="spinner" aria-hidden="true" />
        Войти
      </button>
    </form>

    <template v-else>
      <div class="top">
        <h1>Проверка ответов</h1>
        <button class="link" type="button" @click="logout">Выйти</button>
      </div>

      <div class="toolbar">
        <div class="tabs" role="tablist">
          <button
            v-for="tab in [
              { id: 'pending', label: 'Непроверенные' },
              { id: 'all', label: 'Все' },
            ] as const"
            :key="tab.id"
            type="button"
            role="tab"
            class="tab"
            :class="{ active: filter === tab.id }"
            :aria-selected="filter === tab.id"
            @click="filter = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
        <button class="link" type="button" :disabled="loading" @click="load">Обновить</button>
      </div>

      <p class="hint note">
        +2 — угадано, +1 — частично, ✕ — не засчитано. Результат участника появится в лидерборде,
        когда проверены все его ответы. Частый верный ответ добавьте в
        <code>acceptedAnswers</code> — автопроверка будет сразу предлагать +2.
      </p>

      <div v-if="loading && !data" class="center">
        <span class="spinner" aria-label="Загрузка" />
      </div>

      <ErrorState v-else-if="error && !data" :message="error" @retry="load" />

      <template v-else-if="data">
        <p v-if="error" class="error-text">{{ error }}</p>
        <p v-if="filter === 'pending'" class="hint">Ждут проверки: {{ pendingCount }}</p>

        <p v-if="data.questions.length === 0" class="hint center">
          В викторине нет вопросов с вводом ответа
        </p>
        <p v-else-if="sections.length === 0" class="hint center">Всё проверено 🎉</p>

        <article
          v-for="{ question, groups } in sections"
          :key="`${question.quizId}:${question.id}`"
          class="card"
        >
          <p class="round">
            {{ question.quizTitle }} · {{ question.roundTitle }} · {{ question.id }}
          </p>
          <h2 class="question">{{ question.text }}</h2>
          <p class="expected">
            Засчитываются:
            <span v-for="answer in question.acceptedAnswers" :key="answer" class="chip">
              {{ answer }}
            </span>
          </p>

          <p v-if="groups.length === 0" class="hint">Ответов пока нет</p>

          <ul class="groups">
            <li
              v-for="group in groups"
              :key="group.key"
              class="group"
              :class="[toneClass(group), { reviewed: group.reviewed }]"
            >
              <div class="group-body">
                <p class="answer">
                  {{ group.text }}
                  <span v-if="group.ids.length > 1" class="count">×{{ group.ids.length }}</span>
                </p>
                <p class="meta">
                  <span class="status">{{ statusLabel(group) }}</span>
                  · {{ nicknamesLabel(group.nicknames) }}
                </p>
              </div>
              <div class="actions">
                <button
                  v-for="v in VERDICTS"
                  :key="v.points"
                  type="button"
                  class="verdict"
                  :class="[v.tone, { on: group.reviewed && group.points === v.points }]"
                  :disabled="busy.has(group.key)"
                  :aria-label="v.aria"
                  @click="setVerdict(group, v.points)"
                >
                  {{ v.label }}
                </button>
              </div>
            </li>
          </ul>
        </article>
      </template>
    </template>
  </section>
</template>

<style scoped>
.admin {
  /* частичный балл: тёплый жёлтый, читается и на светлой, и на тёмной теме */
  --warning: #d98e04;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 32px;
}

.field {
  min-height: 48px;
  padding: 12px 16px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: var(--secondary-bg);
  color: var(--text);
  font: inherit;
  font-size: 16px;
  outline: none;
}

.field:focus {
  border-color: var(--accent);
}

.top,
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.top h1 {
  margin: 0;
}

.link {
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}

.link:disabled {
  opacity: 0.5;
}

.tabs {
  display: flex;
  padding: 3px;
  border-radius: 10px;
  background: var(--secondary-bg);
}

.tab {
  padding: 6px 12px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--hint);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.tab.active {
  background: var(--bg);
  color: var(--text);
  font-weight: 600;
}

.note,
.hint {
  margin: 0;
  font-size: 14px;
}

code {
  font-size: 13px;
}

.center {
  display: flex;
  justify-content: center;
  padding: 32px 0;
  text-align: center;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--secondary-bg);
}

.round {
  margin: 0;
  font-size: 13px;
  color: var(--hint);
}

.question {
  margin: 0;
  font-size: 18px;
}

.expected {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 14px;
  color: var(--hint);
}

.chip {
  padding: 2px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--success) 15%, transparent);
  color: var(--text);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.group {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border-left: 4px solid var(--hint);
  background: var(--secondary-bg);
}

.group.full {
  border-left-color: var(--success);
}

.group.half {
  border-left-color: var(--warning);
}

.group.none {
  border-left-color: var(--danger);
}

/* проверенные приглушены, непроверенные бросаются в глаза */
.group.reviewed .group-body {
  opacity: 0.6;
}

.group-body {
  flex: 1;
  min-width: 0;
}

.answer {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.count {
  margin-left: 4px;
  font-size: 14px;
  font-weight: 400;
  color: var(--hint);
}

.meta {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--hint);
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  gap: 6px;
}

.verdict {
  min-width: 44px;
  height: 44px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: var(--bg);
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: scale 0.12s ease;
}

.verdict:not(:disabled):active {
  scale: 0.92;
}

.verdict:disabled {
  opacity: 0.5;
}

.verdict.full {
  color: var(--success);
}

.verdict.half {
  color: var(--warning);
}

.verdict.none {
  color: var(--danger);
}

.verdict.on {
  color: #fff;
}

.verdict.full.on {
  background: var(--success);
}

.verdict.half.on {
  background: var(--warning);
}

.verdict.none.on {
  background: var(--danger);
}
</style>

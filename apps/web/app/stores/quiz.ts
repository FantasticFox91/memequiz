import {
  ANSWER_TEXT_MAX,
  type Answer,
  type AttemptScore,
  type PublicQuestion,
  type PublicRound,
  type QuizInfo,
  type QuizResponse,
  type QuizResult,
  type QuizzesResponse,
  type StatusResponse,
  type SubmitResponse,
} from '@memequiz/shared';
import { defineStore } from 'pinia';
import { useParticipantStore } from './participant';

// прогресс у каждой викторины свой
const progressKey = (quizId: string) => `memequiz:progress:${quizId}`;
// до разделения на викторины прогресс был один — это прогресс викторины по мемам
const LEGACY_PROGRESS_KEY = 'memequiz:progress';
const LEGACY_QUIZ_ID = 'memes';

// прогресс привязан к нику: другой ник начинает с нуля
type SavedProgress = {
  nicknameKey: string;
  index: number;
  answers: Record<string, string>;
  introsSeen: string[];
  // начало текущей попытки (Date.now()): для показа времени повторной попытки
  startedAt: number;
  // id вопросов в порядке попытки: сервер перемешивает их на каждый запрос, а index завязан на порядок
  order?: string[];
};

type Step = { round: PublicRound; question: PublicQuestion; isRoundStart: boolean };

// время повторной попытки меряем сами: сервер считает только засчитанную
export type Attempt = AttemptScore & { durationMs: number };

export const useQuizStore = defineStore('quiz', () => {
  const participant = useParticipantStore();

  // список викторин для главной и лидерборда
  const quizzes = ref<QuizInfo[] | null>(null);
  // викторина, которую сейчас проходят или смотрят результат (из адреса /quiz/:id, /result/:id)
  const quizId = ref<string | null>(null);

  const rounds = ref<PublicRound[] | null>(null);
  const loading = ref(false);
  const loadError = ref<string | null>(null);

  const index = ref(0);
  // questionId → optionId, у вопросов без вариантов — введённый текст
  const answers = ref<Record<string, string>>({});
  const introsSeen = ref<string[]>([]);
  const startedAt = ref<number | null>(null);

  // засчитанные (первые) результаты по id викторины и ник, закреплённый за участником
  const results = ref<Record<string, QuizResult>>({});
  const lockedNickname = ref<string | null>(null);
  const result = computed(() => (quizId.value ? (results.value[quizId.value] ?? null) : null));
  const quizInfo = computed(() => quizzes.value?.find((q) => q.id === quizId.value) ?? null);
  const isFirst = ref<boolean | null>(null);
  // баллы и время последней попытки, если она была «для себя» (не первая)
  const attempt = ref<Attempt | null>(null);
  // повторное прохождение после засчитанного: /quiz не отправляет на результат
  const practice = ref(false);
  const submitting = ref(false);
  const submitError = ref<string | null>(null);
  // только что отправили: экран результата один раз празднует (вибрация, конфетти) и сбрасывает
  const celebrate = ref(false);

  // вопросы всех раундов подряд: прогресс сквозной по всей викторине
  const steps = computed<Step[]>(() =>
    (rounds.value ?? []).flatMap((round) =>
      round.questions.map((question, i) => ({ round, question, isRoundStart: i === 0 })),
    ),
  );
  const total = computed(() => steps.value.length);
  const current = computed<Step | undefined>(() => steps.value[index.value]);
  const isLast = computed(() => index.value === total.value - 1);
  const showIntro = computed(
    () => !!current.value?.isRoundStart && !introsSeen.value.includes(current.value.round.id),
  );
  const selectedOptionId = computed(() =>
    current.value ? answers.value[current.value.question.id] : undefined,
  );
  // можно идти дальше: выбран вариант или введён непустой ответ
  const hasAnswer = computed(() => !!selectedOptionId.value?.trim());

  /**
   * Выбрать викторину по адресу страницы. Другая викторина — состояние попытки с нуля
   * (прогресс прошлой остаётся в localStorage и восстановится при возврате).
   */
  function selectQuiz(id: string) {
    if (quizId.value === id) return;
    quizId.value = id;
    rounds.value = null;
    index.value = 0;
    answers.value = {};
    introsSeen.value = [];
    startedAt.value = null;
    isFirst.value = null;
    attempt.value = null;
    practice.value = false;
    submitError.value = null;
    loadError.value = null;
  }

  async function loadQuizzes() {
    quizzes.value = await useApi()<QuizzesResponse>('/quizzes');
  }

  function saveProgress() {
    if (!quizId.value) return;
    writeStorage(progressKey(quizId.value), {
      nicknameKey: participant.nicknameKey,
      index: index.value,
      answers: answers.value,
      introsSeen: introsSeen.value,
      startedAt: startedAt.value ?? Date.now(),
      order: steps.value.map(({ question }) => question.id),
    } satisfies SavedProgress);
  }

  function resetProgress() {
    index.value = 0;
    answers.value = {};
    introsSeen.value = [];
    startedAt.value = null;
    if (quizId.value) removeStorage(progressKey(quizId.value));
  }

  // после загрузки вопросов: восстановить прогресс, если он этого участника и ещё подходит к вопросам
  function restoreProgress() {
    if (!quizId.value) return;
    let saved = readStorage<SavedProgress>(progressKey(quizId.value));
    if (quizId.value === LEGACY_QUIZ_ID) {
      saved ??= readStorage<SavedProgress>(LEGACY_PROGRESS_KEY);
      removeStorage(LEGACY_PROGRESS_KEY);
    }
    if (!saved || saved.nicknameKey !== participant.nicknameKey) {
      resetProgress();
      return;
    }
    if (Array.isArray(saved.order)) applyOrder(saved.order);
    const valid: Record<string, string> = {};
    for (const { question } of steps.value) {
      const value = saved.answers?.[question.id];
      if (typeof value !== 'string') continue;
      if (question.options ? question.options.some((o) => o.id === value) : true)
        valid[question.id] = value;
    }
    answers.value = valid;
    introsSeen.value = Array.isArray(saved.introsSeen) ? saved.introsSeen : [];
    index.value = Math.min(Math.max(0, saved.index | 0), Math.max(0, total.value - 1));
    startedAt.value = typeof saved.startedAt === 'number' ? saved.startedAt : null;
  }

  // вернуть вопросам в раундах порядок сохранённой попытки; новые вопросы (не из order) — в конец раунда
  function applyOrder(order: string[]) {
    if (!rounds.value) return;
    const position = new Map(order.map((id, i) => [id, i]));
    const rank = (q: PublicQuestion) => position.get(q.id) ?? Number.MAX_SAFE_INTEGER;
    rounds.value = rounds.value.map((round) => ({
      ...round,
      questions: [...round.questions].sort((a, b) => rank(a) - rank(b)),
    }));
  }

  async function load() {
    if (loading.value || !quizId.value) return;
    const id = quizId.value;
    loading.value = true;
    loadError.value = null;
    try {
      const api = useApi();
      // отметка старта для времени засчитанной попытки; сервер пишет только первую.
      // Не дошла — результат запишется без времени, викторину это не блокирует.
      // До вопросов, а не параллельно: новому посетителю сайта она выдаёт куку участника,
      // а от участника зависит набор вопросов (pick) — иначе два запроса получат разные куки
      await api(`/quiz/${id}/start`, { method: 'POST' }).catch(() => undefined);
      const [quiz] = await Promise.all([
        api<QuizResponse>(`/quiz/${id}`),
        quizzes.value ? undefined : loadQuizzes().catch(() => undefined),
      ]);
      // пока грузилось, ушли в другую викторину
      if (quizId.value !== id) return;
      rounds.value = quiz;
      restoreProgress();
      if (startedAt.value === null) startedAt.value = Date.now();
      // всегда: порядок вопросов этой попытки должен попасть в прогресс до первого ответа
      saveProgress();
    } catch (e) {
      loadError.value = apiErrorMessage(e);
    } finally {
      loading.value = false;
    }
  }

  function startRound() {
    if (!current.value) return;
    introsSeen.value = [...introsSeen.value, current.value.round.id];
    saveProgress();
  }

  function select(optionId: string) {
    if (!current.value || submitting.value) return;
    answers.value = { ...answers.value, [current.value.question.id]: optionId };
    saveProgress();
  }

  function setText(text: string) {
    if (!current.value || submitting.value) return;
    answers.value = {
      ...answers.value,
      [current.value.question.id]: text.slice(0, ANSWER_TEXT_MAX),
    };
    saveProgress();
  }

  function next() {
    if (!hasAnswer.value || isLast.value) return;
    index.value++;
    saveProgress();
  }

  function setResult(value: QuizResult, first: boolean, attemptValue: Attempt | null = null) {
    results.value = { ...results.value, [value.quizId]: value };
    lockedNickname.value ??= value.nickname;
    isFirst.value = first;
    attempt.value = attemptValue;
  }

  function clearResult() {
    results.value = {};
    lockedNickname.value = null;
    isFirst.value = null;
    attempt.value = null;
  }

  /**
   * Засчитанные результаты участника по всем викторинам (участника сервер знает по куке или initData)
   * и закреплённый за ним ник. nickname (сайт): заодно проверить, что ник свободен, — иначе ошибка 409.
   */
  async function fetchStatus(nickname?: string): Promise<StatusResponse> {
    const status = await useApi()<StatusResponse>('/me/status', {
      query: nickname ? { nickname } : undefined,
    });
    results.value = status.results;
    lockedNickname.value = status.nickname;
    return status;
  }

  // пройти ещё раз «для себя»: в зачёт идёт только первый результат
  function startPractice() {
    practice.value = true;
    attempt.value = null;
    resetProgress();
    rounds.value = null;
  }

  // все ответы одним запросом; повторный вызов во время отправки игнорируется
  async function submit(): Promise<boolean> {
    if (submitting.value || !quizId.value) return false;
    submitting.value = true;
    submitError.value = null;
    try {
      const body = {
        // в Telegram ник берётся сервером из профиля
        nickname: useTelegram().isTelegram ? undefined : participant.nickname,
        answers: steps.value.map(({ question }): Answer => {
          const value = answers.value[question.id] ?? '';
          return question.options
            ? { questionId: question.id, optionId: value }
            : { questionId: question.id, text: value.trim() };
        }),
      };
      const response = await useApi()<SubmitResponse>(`/quiz/${quizId.value}/submit`, {
        method: 'POST',
        body,
      });
      const durationMs = startedAt.value === null ? 0 : Date.now() - startedAt.value;
      setResult(
        response.result,
        response.isFirst,
        response.isFirst ? null : { ...response.attempt, durationMs },
      );
      practice.value = false;
      celebrate.value = true;
      resetProgress();
      rounds.value = null;
      return true;
    } catch (e) {
      // ответы остаются в store и localStorage, можно повторить
      submitError.value = apiErrorMessage(e);
      return false;
    } finally {
      submitting.value = false;
    }
  }

  return {
    quizzes,
    quizId,
    quizInfo,
    results,
    lockedNickname,
    rounds,
    loading,
    loadError,
    index,
    answers,
    result,
    isFirst,
    attempt,
    practice,
    submitting,
    submitError,
    celebrate,
    total,
    current,
    isLast,
    showIntro,
    selectedOptionId,
    hasAnswer,
    selectQuiz,
    loadQuizzes,
    load,
    startRound,
    select,
    setText,
    next,
    setResult,
    clearResult,
    fetchStatus,
    startPractice,
    submit,
    resetProgress,
  };
});

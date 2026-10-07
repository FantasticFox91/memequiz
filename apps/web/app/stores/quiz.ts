import type {
  Answer,
  AttemptScore,
  PublicQuestion,
  PublicRound,
  QuizResponse,
  QuizResult,
  StatusResponse,
  SubmitResponse,
} from '@memequiz/shared';
import { defineStore } from 'pinia';
import { useParticipantStore } from './participant';

const PROGRESS_KEY = 'memequiz:progress';

// прогресс привязан к нику: другой ник начинает с нуля
type SavedProgress = {
  nicknameKey: string;
  index: number;
  answers: Record<string, string>;
  introsSeen: string[];
  // начало текущей попытки (Date.now()): для показа времени повторной попытки
  startedAt: number;
};

type Step = { round: PublicRound; question: PublicQuestion; isRoundStart: boolean };

// время повторной попытки меряем сами: сервер считает только засчитанную
export type Attempt = AttemptScore & { durationMs: number };

export const useQuizStore = defineStore('quiz', () => {
  const participant = useParticipantStore();

  const rounds = ref<PublicRound[] | null>(null);
  const loading = ref(false);
  const loadError = ref<string | null>(null);

  const index = ref(0);
  // questionId → optionId
  const answers = ref<Record<string, string>>({});
  const introsSeen = ref<string[]>([]);
  const startedAt = ref<number | null>(null);

  // засчитанный (первый) результат
  const result = ref<QuizResult | null>(null);
  const isFirst = ref<boolean | null>(null);
  // баллы и время последней попытки, если она была «для себя» (не первая)
  const attempt = ref<Attempt | null>(null);
  // повторное прохождение после засчитанного: /quiz не отправляет на результат
  const practice = ref(false);
  const submitting = ref(false);
  const submitError = ref<string | null>(null);

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

  function saveProgress() {
    writeStorage(PROGRESS_KEY, {
      nicknameKey: participant.nicknameKey,
      index: index.value,
      answers: answers.value,
      introsSeen: introsSeen.value,
      startedAt: startedAt.value ?? Date.now(),
    } satisfies SavedProgress);
  }

  function resetProgress() {
    index.value = 0;
    answers.value = {};
    introsSeen.value = [];
    startedAt.value = null;
    removeStorage(PROGRESS_KEY);
  }

  // после загрузки вопросов: восстановить прогресс, если он этого участника и ещё подходит к вопросам
  function restoreProgress() {
    const saved = readStorage<SavedProgress>(PROGRESS_KEY);
    if (!saved || saved.nicknameKey !== participant.nicknameKey) {
      resetProgress();
      return;
    }
    const valid: Record<string, string> = {};
    for (const { question } of steps.value) {
      const optionId = saved.answers?.[question.id];
      if (optionId && question.options.some((o) => o.id === optionId))
        valid[question.id] = optionId;
    }
    answers.value = valid;
    introsSeen.value = Array.isArray(saved.introsSeen) ? saved.introsSeen : [];
    index.value = Math.min(Math.max(0, saved.index | 0), Math.max(0, total.value - 1));
    startedAt.value = typeof saved.startedAt === 'number' ? saved.startedAt : null;
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    loadError.value = null;
    try {
      const api = useApi();
      // отметка старта для времени засчитанной попытки; сервер пишет только первую.
      // Не дошла — результат запишется без времени, викторину это не блокирует
      const [quiz] = await Promise.all([
        api<QuizResponse>('/quiz'),
        api('/quiz/start', { method: 'POST' }).catch(() => undefined),
      ]);
      rounds.value = quiz;
      restoreProgress();
      if (startedAt.value === null) {
        startedAt.value = Date.now();
        saveProgress();
      }
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

  function next() {
    if (!selectedOptionId.value || isLast.value) return;
    index.value++;
    saveProgress();
  }

  function setResult(value: QuizResult, first: boolean, attemptValue: Attempt | null = null) {
    result.value = value;
    isFirst.value = first;
    attempt.value = attemptValue;
  }

  function clearResult() {
    result.value = null;
    isFirst.value = null;
    attempt.value = null;
  }

  /**
   * Проходил ли участник раньше (участника сервер знает по куке или initData);
   * если да — его первый результат попадает в store.
   * nickname (сайт): заодно проверить, что ник свободен, — иначе ошибка 409.
   */
  async function fetchStatus(nickname?: string): Promise<boolean> {
    const status = await useApi()<StatusResponse>('/me/status', {
      query: nickname ? { nickname } : undefined,
    });
    if (status.completed) setResult(status.result, false);
    return status.completed;
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
    if (submitting.value) return false;
    submitting.value = true;
    submitError.value = null;
    try {
      const body = {
        // в Telegram ник берётся сервером из профиля
        nickname: useTelegram().isTelegram ? undefined : participant.nickname,
        answers: steps.value.map(({ question }): Answer => ({
          questionId: question.id,
          optionId: answers.value[question.id] ?? '',
        })),
      };
      const response = await useApi()<SubmitResponse>('/quiz/submit', { method: 'POST', body });
      const durationMs = startedAt.value === null ? 0 : Date.now() - startedAt.value;
      setResult(
        response.result,
        response.isFirst,
        response.isFirst ? null : { ...response.attempt, durationMs },
      );
      practice.value = false;
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
    total,
    current,
    isLast,
    showIntro,
    selectedOptionId,
    load,
    startRound,
    select,
    next,
    setResult,
    clearResult,
    fetchStatus,
    startPractice,
    submit,
    resetProgress,
  };
});

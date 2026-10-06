import type {
  Answer,
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

// прогресс привязан к участнику: другой ник начинает с нуля
type SavedProgress = {
  externalId: string;
  index: number;
  answers: Record<string, string>;
  introsSeen: string[];
};

type Step = { round: PublicRound; question: PublicQuestion; isRoundStart: boolean };

export const useQuizStore = defineStore('quiz', () => {
  const participant = useParticipantStore();

  const rounds = ref<PublicRound[] | null>(null);
  const loading = ref(false);
  const loadError = ref<string | null>(null);

  const index = ref(0);
  // questionId → optionId
  const answers = ref<Record<string, string>>({});
  const introsSeen = ref<string[]>([]);

  const result = ref<QuizResult | null>(null);
  const isFirst = ref<boolean | null>(null);
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
      externalId: participant.externalId,
      index: index.value,
      answers: answers.value,
      introsSeen: introsSeen.value,
    } satisfies SavedProgress);
  }

  function resetProgress() {
    index.value = 0;
    answers.value = {};
    introsSeen.value = [];
    removeStorage(PROGRESS_KEY);
  }

  // после загрузки вопросов: восстановить прогресс, если он этого участника и ещё подходит к вопросам
  function restoreProgress() {
    const saved = readStorage<SavedProgress>(PROGRESS_KEY);
    if (!saved || saved.externalId !== participant.externalId) {
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
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    loadError.value = null;
    try {
      rounds.value = await useApi()<QuizResponse>('/quiz');
      restoreProgress();
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

  function setResult(value: QuizResult, first: boolean) {
    result.value = value;
    isFirst.value = first;
  }

  // проходил ли участник раньше; если да — его первый результат попадает в store
  async function fetchStatus(): Promise<boolean> {
    const status = await useApi()<StatusResponse>('/me/status', {
      query: { nickname: participant.nickname },
    });
    if (status.completed) setResult(status.result, false);
    return status.completed;
  }

  // все ответы одним запросом; повторный вызов во время отправки игнорируется
  async function submit(): Promise<boolean> {
    if (submitting.value) return false;
    submitting.value = true;
    submitError.value = null;
    try {
      const body = {
        nickname: participant.nickname,
        answers: steps.value.map(({ question }): Answer => ({
          questionId: question.id,
          optionId: answers.value[question.id] ?? '',
        })),
      };
      const response = await useApi()<SubmitResponse>('/quiz/submit', { method: 'POST', body });
      setResult(response.result, response.isFirst);
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
    fetchStatus,
    submit,
    resetProgress,
  };
});

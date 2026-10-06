import {
  type PublicQuestion,
  type PublicRound,
  type Question,
  type Round,
  publicQuestionSchema,
  publicRoundSchema,
} from '@memequiz/shared';

// единственные точки, через которые вопросы уходят наружу: zod отбрасывает correctId и прочие лишние поля
export function toPublicQuestion(question: Question): PublicQuestion {
  return publicQuestionSchema.parse(question);
}

export function toPublicRound(round: Round): PublicRound {
  return publicRoundSchema.parse(round);
}

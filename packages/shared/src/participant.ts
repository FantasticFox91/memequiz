import { z } from 'zod';

export const participantSourceSchema = z.enum(['web', 'tg']);

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 24;

// форма для показа: NFKC, без пробелов по краям, внутренние пробелы схлопнуты
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

// ключ для сравнения ников: "  Вася  " и "вася" — один и тот же ник
export function nicknameKey(raw: string): string {
  return normalizeNickname(raw).toLowerCase();
}

export const nicknameSchema = z
  .string({ error: 'Введите ник' })
  .transform(normalizeNickname)
  .pipe(
    z
      .string()
      .min(NICKNAME_MIN, `Ник: от ${NICKNAME_MIN} символов`)
      .max(NICKNAME_MAX, `Ник: до ${NICKNAME_MAX} символов`)
      .regex(/^[a-zA-Zа-яА-ЯёЁ0-9 _-]+$/, 'Ник: только буквы, цифры, пробел, _ и -'),
  );

// из чужого имени (Telegram username, имя с эмодзи) делает ник по нашим правилам; '' — если ничего не осталось
export function suggestNickname(raw: string): string {
  const cleaned = normalizeNickname(raw.normalize('NFKC').replace(/[^a-zA-Zа-яА-ЯёЁ0-9 _-]/g, ''));
  const trimmed = cleaned.slice(0, NICKNAME_MAX).trim();
  return trimmed.length >= NICKNAME_MIN ? trimmed : '';
}

// поля Telegram user, из которых строится ник
export type TelegramNameSource = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

// ник участника из Telegram: username, иначе имя, иначе tg<id>. Изменить его нельзя,
// поэтому одна функция и для сервера, и для показа на фронте
export function telegramNickname(user: TelegramNameSource): string {
  return (
    suggestNickname(user.username ?? '') ||
    suggestNickname([user.first_name, user.last_name].filter(Boolean).join(' ')) ||
    `tg${user.id}`
  );
}

export const participantSchema = z.object({
  source: participantSourceSchema,
  externalId: z.string().min(1),
  nickname: z.string().min(1),
});

export type ParticipantSource = z.infer<typeof participantSourceSchema>;
export type Participant = z.infer<typeof participantSchema>;

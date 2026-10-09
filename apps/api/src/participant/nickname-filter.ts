import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// dist/participant/*.js → apps/api/content (в Docker: /app/content)
const STOPWORDS_PATH = resolve(__dirname, '../../content/nickname-stopwords.txt');

// похожие символы → кириллица: xyй, сyкa, 3аеб, @
const TO_CYRILLIC: Record<string, string> = {
  a: 'а',
  b: 'в',
  c: 'с',
  e: 'е',
  h: 'н',
  i: 'и',
  k: 'к',
  m: 'м',
  n: 'п',
  o: 'о',
  p: 'р',
  r: 'г',
  t: 'т',
  u: 'и',
  x: 'х',
  y: 'у',
  z: 'з',
  ё: 'е',
  і: 'и',
  '0': 'о',
  '1': 'и',
  '3': 'з',
  '4': 'ч',
  '6': 'б',
  '@': 'а',
};

// похожие символы → латиница: fuсk с кириллической «с», sh1t, @ss
const TO_LATIN: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/**
 * «Скелет» строки для сравнения: нижний регистр, похожие символы заменены по таблице,
 * всё, кроме букв нужного алфавита, выброшено, повторы букв схлопнуты (хууууй → хуй).
 */
function skeleton(raw: string, map: Record<string, string>, letters: RegExp): string {
  let out = '';
  for (const ch of raw.normalize('NFKC').toLowerCase()) {
    const c = map[ch] ?? ch;
    if (letters.test(c) && c !== out.at(-1)) out += c;
  }
  return out;
}

const cyrillic = (s: string) => skeleton(s, TO_CYRILLIC, /^[а-яй]$/);
const latin = (s: string) => skeleton(s, TO_LATIN, /^[a-z]$/);

type Alphabet = { fold: (s: string) => string; words: string[]; exceptions: string[] };

export type NicknameFilter = (nickname: string) => boolean;

/** Из текста файла стоп-слов: функция «ник допустим». Корни и исключения сводятся к скелету так же, как ник. */
export function createNicknameFilter(text: string): NicknameFilter {
  const ru: Alphabet = { fold: cyrillic, words: [], exceptions: [] };
  const en: Alphabet = { fold: latin, words: [], exceptions: [] };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const isException = line.startsWith('!');
    const word = isException ? line.slice(1).trim() : line;
    const alphabet = /[а-яё]/i.test(word) ? ru : en;
    const folded = alphabet.fold(word);
    if (folded) (isException ? alphabet.exceptions : alphabet.words).push(folded);
  }

  const matches = (nickname: string, { fold, words, exceptions }: Alphabet) => {
    let s = fold(nickname);
    for (const e of exceptions) s = s.replaceAll(e, ' ');
    return words.some((w) => s.includes(w));
  };

  return (nickname) => !matches(nickname, ru) && !matches(nickname, en);
}

// читается при загрузке модуля: нет файла — api падает на старте, как без questions.json
export const isNicknameAllowed: NicknameFilter = createNicknameFilter(
  readFileSync(STOPWORDS_PATH, 'utf8'),
);

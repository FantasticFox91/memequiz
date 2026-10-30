import { normalizeAnswer } from '@memequiz/shared';

// сколько опечаток прощаем: короткие ответы — точно, длинные — до двух ошибок
function allowedTypos(length: number): number {
  if (length <= 4) return 0;
  if (length <= 9) return 1;
  return 2;
}

// расстояние Левенштейна: вставка, удаление, замена символа
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

export function isAcceptedAnswer(text: string, accepted: readonly string[]): boolean {
  const given = normalizeAnswer(text);
  if (!given) return false;
  return accepted.some((answer) => {
    const expected = normalizeAnswer(answer);
    return distance(given, expected) <= allowedTypos(expected.length);
  });
}

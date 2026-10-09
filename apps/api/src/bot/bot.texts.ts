// Тексты бота. Разметка — HTML (parse_mode: 'HTML'): пользовательские данные экранировать через escapeHtml

export const BUTTON_PLAY = '🎮 Пройти викторину';
export const MENU_BUTTON = 'Викторина';

// «What can this bot do?» — экран до первого /start, до 512 символов
export const DESCRIPTION =
  'MemeQuiz — викторина по мемам. Угадывай мемы, вспоминай фразы и персонажей, ' +
  'соревнуйся с друзьями в лидерборде. Жми «Старт» 👇';

// профиль бота и превью при пересылке ссылки, до 120 символов
export const SHORT_DESCRIPTION = 'Викторина по мемам: проверь, насколько ты в теме 🧠';

export function welcomeText(name: string, rounds: readonly string[], total: number): string {
  return [
    `Привет, <b>${escapeHtml(name)}</b>! 👋`,
    '',
    'Это <b>MemeQuiz</b> — викторина для тех, кто слишком много сидит в мемах.',
    '',
    `🧩 ${total} ${plural(total, 'вопрос', 'вопроса', 'вопросов')} в ${rounds.length} ${plural(rounds.length, 'раунде', 'раундах', 'раундах')}:`,
    ...rounds.map((title) => `   • ${escapeHtml(title)}`),
    '',
    '⏱ Время тоже считается, так что не тормози',
    '🏆 В зачёт идёт только первая попытка, потом можно перепроходить для себя',
    '',
    'Жми кнопку и проверь, насколько ты в теме 👇',
  ].join('\n');
}

export const HELP_TEXT =
  'Нажми кнопку ниже или «Викторина» слева от поля ввода, чтобы открыть MemeQuiz.\n' +
  '/start — приветствие ещё раз';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

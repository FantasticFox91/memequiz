# Этап 7. Telegram Mini App

**Оценка:** ≈4–6 ч

**Цель:** та же викторина открывается из бота, участник определяется надёжно.

## Зависимости

- Этап 0: бот создан, токен есть.
- Этап 3: абстракция участника (`ParticipantResolver`).
- Этап 6: приложение доступно по публичному HTTPS-адресу.

## Задачи

### Скрипт и SDK
- [ ] Подключить `https://telegram.org/js/telegram-web-app.js` в `<head>` через `app.head` в `nuxt.config` или использовать `@telegram-apps/sdk-vue`. Выбрать один вариант.
- [ ] Composable `useTelegram()`:
  - `isTelegram`: открыто ли внутри Telegram (непустой `initData`);
  - `initData` (сырая строка) и `initDataUnsafe.user` (только для UI);
  - обёртки над `ready()`, `expand()`, `BackButton`, `MainButton`, `HapticFeedback`, `themeParams`.
- [ ] Вызывать `Telegram.WebApp.ready()` как можно раньше после загрузки.
- [ ] В `useApi()`: если `isTelegram`, добавлять ко всем запросам заголовок с `initData` (например `Authorization: tma <initData>`).

### TelegramAuthGuard в Nest
- [ ] Разобрать `initData` как query-строку.
- [ ] Проверка подписи:
  - `data_check_string`: все поля, кроме `hash` (и `signature`, если есть), отсортированные по ключу, в формате `key=value`, через `\n`;
  - `secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)`;
  - сравнить `hex(HMAC_SHA256(key=secret_key, msg=data_check_string))` с `hash` через `timingSafeEqual`.
- [ ] Проверить свежесть `auth_date` (например не старше 24 часов, вынести в env `TG_INIT_DATA_TTL`).
- [ ] Распарсить `user` (JSON) и положить в `request.telegramUser`.
- [ ] При неверной подписи вернуть 401.
- [ ] Проверить вручную: валидная подпись проходит, подменённое поле и просроченный `auth_date` дают 401.

### Единый guard участника
- [ ] Расширить `ParticipantResolver`:
  - есть заголовок с `initData` → проверка подписи → `source: 'tg'`, `externalId: String(user.id)`, `nickname` из тела (или из username);
  - нет заголовка → web-ветка по нику, как раньше.
- [ ] Если заголовок есть, но подпись невалидна, вернуть 401, а не откатываться к web-ветке.
- [ ] `/me/status` и `/quiz/submit` работают для обоих источников без изменений в контроллерах.
- [ ] E2E: повторный submit с тем же `user.id`, но другим ником, возвращает `isFirst: false`.

### Ник в Telegram
- [x] Предзаполнять из `user.username`, иначе из `first_name` (+ `last_name`). Сделано заранее, на этапе 4: `useTelegram()` читает `tgWebAppData` из hash без SDK, `suggestNickname()` в `shared`. Сервер пока видит обычный web-ник.
- [x] Прогонять через те же правила валидации. Если не проходит (эмодзи, длина), обрезать или очистить и попросить отредактировать.
- [x] Дать отредактировать ник перед стартом.
- [ ] Перед вводом ника вызвать `/me/status`: если пройдено, сразу вести на результат.

### UI под Telegram
- [ ] Цвета из `themeParams` (`bg_color`, `text_color`, `button_color`, `button_text_color`, `hint_color`, `secondary_bg_color`) мапятся на CSS-переменные из этапа 4. Слушать событие `themeChanged`.
- [ ] Вызывать `expand()` при старте.
- [ ] `BackButton`: показывать на `/quiz` и `/leaderboard`, по нажатию `router.back()` или переход на нужный экран. Скрывать на `/`.
- [ ] `MainButton`: «Начать», «Далее», «Завершить». Активна или неактивна по состоянию, `showProgress()` во время отправки. Свои кнопки в Telegram скрывать, чтобы не дублировать.
- [ ] Safe area: `safeAreaInset` и `contentSafeAreaInset` (CSS-переменные `--tg-safe-area-inset-*`) плюс `env(safe-area-inset-*)`.
- [ ] Использовать `viewportStableHeight` вместо `100vh`.
- [ ] Подтверждение закрытия (`enableClosingConfirmation`) во время прохождения викторины.

### BotFather
- [x] Main Mini App включён (`Bot Settings → Configure Mini App`), прямая ссылка `t.me/<bot>?startapp`. Проверено на тестовой странице `sandbox/tg-test`.
- [x] Menu Button указывает на `https://memequiz.139-100-225-182.sslip.io`.
- [ ] После деплоя викторины убедиться, что URL в обоих местах ведёт на неё, а не на тестовую страницу.
- [ ] Задать описание и картинку бота.

### Бот (опционально)
- [ ] Обработчик `/start`: приветствие и inline-кнопка `web_app` «Пройти викторину».
- [ ] Реализация: grammY в отдельном небольшом сервисе в compose или модуль внутри Nest.
- [ ] Режим: long polling (проще, не нужен входящий маршрут) или webhook через Caddy (`/tg/webhook` с secret token).

### Тестирование
- [ ] iOS: вьюпорт, safe area, клавиатура при вводе ника.
- [ ] Android: кнопка «назад» системы, тема.
- [ ] Desktop (Windows/macOS) и Telegram Web: размер окна, отсутствие `expand()`.
- [ ] Светлая и тёмная тема.
- [ ] Открытие по ссылке из Menu Button, из inline-кнопки и по прямой ссылке `t.me/<bot>/<app>`.

## Готово, когда

- [ ] Викторина открывается из бота и проходится от начала до конца.
- [ ] Повторное прохождение с того же аккаунта не засчитывается даже под другим ником.
- [ ] Подделанный `initData` отклоняется с 401.
- [ ] Веб-версия в обычном браузере продолжает работать как раньше.

## Артефакты

- `apps/web/app/composables/useTelegram.ts`
- `apps/api/src/auth/telegram-auth.guard.ts` (или логика в `ParticipantResolver`)
- Настройки бота в BotFather
- Опционально: `apps/bot` или `BotModule`

## Риски / заметки

- Никогда не доверяйте `initDataUnsafe` на сервере: только проверенный `initData`.
- Telegram-ник и web-ник — разные пространства: один человек может пройти и в вебе, и в Telegram. Если это важно, нужно отдельное решение (например web-версию закрывать после запуска Telegram).
- Telegram Desktop и Web могут иметь старые версии WebApp API. Проверяйте `isVersionAtLeast()` перед использованием новых методов.

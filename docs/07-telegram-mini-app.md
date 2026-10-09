# Этап 7. Telegram Mini App

**Оценка:** ≈4–6 ч

**Цель:** та же викторина открывается из бота, участник определяется надёжно.

## Зависимости

- Этап 0: бот создан, токен есть.
- Этап 3: абстракция участника (`ParticipantResolver`).
- Этап 6: приложение доступно по публичному HTTPS-адресу.

## Задачи

### Скрипт и SDK
- [x] `https://telegram.org/js/telegram-web-app.js` в `<head>` через `app.head` в `nuxt.config` (без `@telegram-apps/sdk-vue`). Типы используемой части API — `app/types/telegram.d.ts`.
- [x] Composable `useTelegram()`:
  - `isTelegram`: открыто ли внутри Telegram (непустой `initData`);
  - `initData` читается из hash стартового URL сам, без SDK: авторизация работает, даже если скрипт с telegram.org не загрузился; `user` — только для UI;
  - `webApp` (SDK или `null`) и `supports(version)` для проверки `isVersionAtLeast`.
- [x] `ready()` и `expand()` в `plugins/telegram.client.ts`, до монтирования приложения.
- [x] В `useApi()`: если `isTelegram`, ко всем запросам добавляется `Authorization: tma <initData>`.

### TelegramAuthGuard в Nest
- [x] `participant/telegram-init-data.ts`: `verifyInitData()` — разбор, проверка подписи, `auth_date`, `user`.
- [x] Проверка подписи:
  - `data_check_string`: все поля, кроме `hash`, отсортированные по ключу, в формате `key=value`, через `\n`. Поле `signature` по документации входит в строку, но принимаем и вариант без него;
  - `secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)`;
  - сравнить `HMAC_SHA256(key=secret_key, msg=data_check_string)` с `hash` через `timingSafeEqual`.
- [x] Свежесть `auth_date`: env `TG_INIT_DATA_TTL` (секунды, по умолчанию 86400), плюс отказ для дат из будущего (больше 5 минут).
- [x] `user` (JSON) кладётся в `request.telegramUser`.
- [x] `TelegramAuthGuard` подключён глобально (`APP_GUARD`). При неверной подписи — 401. Без `TELEGRAM_BOT_TOKEN` запросы из Telegram тоже получают 401 (и предупреждение в логе при старте).
- [x] Проверено тестом на `verifyInitData`: валидная подпись проходит; подменённое поле, чужой токен, просроченный и «будущий» `auth_date`, битый `hash` отклоняются.
- [ ] Проверить на сервере через curl (`scripts/tg-init-data.mjs` печатает подписанный заголовок).

### Правила участника (2026-10-07)
- [x] Сайт: участник — httpOnly-кука `mq_pid` (UUID, 400 дней, path `/api`), ник выбирает сам. Ник должен быть свободен (без учёта регистра): проверка уже при «Начать» (`/me/status?nickname=` → 409) и ещё раз при submit под advisory-lock.
- [x] Telegram: участник — `user.id`, ник из профиля (`telegramNickname()` в shared: username → имя → `tg<id>`), изменить нельзя; присланный ник сервер игнорирует. На уникальность не проверяется.
- [x] В зачёт и лидерборд идёт только первая попытка. Повторные «для себя» разрешены: сервер считает баллы и возвращает их в `attempt`, но не сохраняет.
- [x] Колонка `nickname_key` (миграция `20261007180000_nickname_key`): ключ ника считается в JS, потому что `lower()` в Postgres зависит от локали.
- [x] Время прохождения (миграция `20261007190000_duration`): `POST /quiz/start` при загрузке викторины пишет в `quiz_starts` только первую отметку; при первом submit `duration_ms = now − started_at`. Лидерборд: баллы ↓, время ↑ (без времени — в конце), дата ↑. Повторные попытки засекаются на клиенте, только для показа.
- [ ] Старые web-результаты были привязаны к нику, а не к куке: их владельцы увидят викторину заново, а их ник будет «занят».

### Единый guard участника
- [x] `resolveParticipant()`:
  - есть `request.telegramUser` → `source: 'tg'`, `externalId: String(user.id)`, `nickname` из тела/query; если ника нет (`/me/status` до ввода ника) — из username/имени или `tg<id>`;
  - нет заголовка → web-ветка по нику, как раньше.
- [x] Заголовок есть, но подпись невалидна → 401, без отката к web-ветке.
- [x] `/me/status` и `/quiz/submit` работают для обоих источников без изменений в контроллерах.
- [ ] E2E: повторный submit с тем же `user.id`, но другим ником, возвращает `isFirst: false`.

### Ник в Telegram
- [x] Предзаполнять из `user.username`, иначе из `first_name` (+ `last_name`). Сделано заранее, на этапе 4: `useTelegram()` читает `tgWebAppData` из hash без SDK, `suggestNickname()` в `shared`. Сервер пока видит обычный web-ник.
- [x] Прогонять через те же правила валидации. Если не проходит (эмодзи, длина), обрезать или очистить и попросить отредактировать.
- [x] Дать отредактировать ник перед стартом.
- [x] Перед вводом ника вызвать `/me/status` (один раз за запуск): если пройдено, сразу вести на результат.

### UI под Telegram
- [x] Цвета: под `html[data-tg]` CSS-переменные этапа 4 берутся из `--tg-theme-*`. Эти переменные выставляет и обновляет при `themeChanged` сам `telegram-web-app.js`, так что JS-обработчик не нужен.
- [x] `expand()` при старте.
- [x] `BackButton`: видна на `/quiz` и `/leaderboard`. С лидерборда — `router.back()`, если есть история, иначе на `/`; с викторины — на `/`. На `/` и `/result` скрыта.
- [x] `MainButton` (`useTelegramMainButton`): «Начать», «Начать раунд», «Далее», «Завершить»/«Повторить», «Лидерборд» на результате. Активность по состоянию, `showProgress()` во время отправки. Свои кнопки в Telegram скрыты.
- [x] Safe area: `max(env(safe-area-inset-*), --tg-safe-area-inset-* + --tg-content-safe-area-inset-*)`.
- [x] `--tg-viewport-stable-height` вместо `100dvh` для высоты layout.
- [x] Подтверждение закрытия (`enableClosingConfirmation`) на `/quiz`.
- [x] `HapticFeedback.selectionChanged()` при выборе варианта.

### BotFather
- [x] Main Mini App включён (`Bot Settings → Configure Mini App`), прямая ссылка `t.me/<bot>?startapp`. Проверено на тестовой странице `sandbox/tg-test`.
- [x] Menu Button: бот сам ставит его на `WEB_APP_URL` при каждом старте (`setChatMenuButton`), руками в BotFather не нужно.
- [ ] Main Mini App переключить на новый адрес `https://memequiz.94-141-161-179.sslip.io` (раньше был `memequiz.139-100-225-182.sslip.io`, старый сервер). Через API это не настраивается, только в BotFather.
- [ ] Убедиться, что URL в обоих местах ведёт на викторину, а не на тестовую страницу.
- [x] Описание («What can this bot do?») и короткое описание бот выставляет сам при старте (`setMyDescription`, `setMyShortDescription`), тексты в `bot/bot.texts.ts`.
- [ ] Картинка бота (аватар) — вручную в BotFather (`/setuserpic`).

### Бот
- [x] Обработчик `/start`: приветствие с именем, числом вопросов и списком раундов из `questions.json`, inline-кнопка `web_app` «Пройти викторину». На любое другое сообщение — подсказка с той же кнопкой.
- [x] Реализация: grammY, модуль `BotModule` внутри Nest (`apps/api/src/bot`). Ошибки бота логируются и не роняют api.
- [x] Режим: long polling, входящий маршрут не нужен. Включается `BOT_ENABLED=true` (в prod compose по умолчанию), `WEB_APP_URL` в compose собирается из `SITE_ADDRESS`. Локально бот выключен: у Telegram один получатель обновлений на токен.

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

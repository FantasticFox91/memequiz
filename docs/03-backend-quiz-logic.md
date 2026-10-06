# Этап 3. Бэкенд: логика викторины

**Оценка:** ≈4–6 ч

**Цель:** API полностью проводит человека через викторину и сохраняет первый результат.

## Зависимости

- Этап 1: Nest, Prisma, Postgres.
- Этап 2: `questions.json` и схемы в `packages/shared`.

## Задачи

### Миграция results (сделано на этапе 1, миграция `init`)
- [x] Модель `Result` в `schema.prisma`:
  - `id`: автоинкремент или uuid;
  - `source`: строка или enum `web | tg`;
  - `externalId`: строка;
  - `nickname`: строка;
  - `score`: int;
  - `total`: int;
  - `createdAt`: `@default(now())`, timestamptz;
  - `syncedAt`: nullable, понадобится на этапе 5, но удобнее добавить сразу.
- [x] Маппинг имён в snake_case (`@map`, `@@map("results")`).
- [x] Уникальный индекс `@@unique([source, externalId])`.
- [x] Индекс для лидерборда: `(score DESC, created_at ASC)`.
- [x] Миграция создана и применена.

### Идентификация участника
- [ ] Тип `Participant { source, externalId, nickname }` в `packages/shared`.
- [ ] `ParticipantResolver` (сервис) или декоратор `@CurrentParticipant()`, через который контроллеры получают участника. Контроллеры не знают, откуда он взялся.
- [ ] Web-вариант: ник берётся из тела или query-параметра, нормализуется в `externalId`: trim, схлопывание пробелов, Unicode NFKC, lower-case.
- [ ] Оставить точку расширения под Telegram (этап 7): позже добавится ветка с `initData`.

### Эндпоинты
- [ ] `GET /api/quiz`: список `PublicRound` (через `toPublicRound()`), внутри вопросы без `correctId`. Порядок раундов и вопросов как в файле. Порядок вариантов перемешивается (Fisher–Yates). Ответы идентифицируются по `optionId`, поэтому перемешивание безопасно.
- [ ] `GET /api/me/status?nickname=...`: `{ completed: false }` или `{ completed: true, result: { score, total, createdAt, nickname } }`.
- [ ] `POST /api/quiz/submit`: тело `{ nickname, answers: [{ questionId, optionId }] }`.
  - [ ] Баллы считаются только на сервере, по `questions.json`.
  - [ ] Вставка через `prisma.$queryRaw`: `INSERT ... ON CONFLICT (source, external_id) DO NOTHING RETURNING *`. В Prisma нет нативного «do nothing + returning», а `upsert` и перехват `P2002` менее аккуратны.
  - [ ] Если `RETURNING` вернул строку, ответ `{ result, isFirst: true }`.
  - [ ] Если строки нет, прочитать существующую запись и ответить `{ result: <первый>, isFirst: false }`.
- [ ] `GET /api/leaderboard?limit=50`: сортировка `score DESC, created_at ASC`, поля `nickname, score, total, createdAt, rank`.
- [ ] Описать DTO ответов zod-схемами в `packages/shared`, чтобы фронт был типизирован.

### Валидация
- [ ] Ник: длина 2–24 символа после trim. Допустимы буквы (латиница и кириллица), цифры, пробел, `_` и `-`. Запрещены пустые и состоящие из одних пробелов.
- [ ] `answers.length` равно количеству вопросов.
- [ ] Каждый `questionId` существует, без дублей.
- [ ] Каждый `optionId` принадлежит своему вопросу.
- [ ] Ошибки валидации возвращают 400 с понятным сообщением.

### Ручная проверка (автотесты не пишем)
- [ ] Файл `apps/api/requests.http` со всеми запросами сценария для REST-клиента.
- [ ] Нормализация ника: `"  Вася  "` и `"вася"` считаются одним участником.
- [ ] Сценарии через REST-клиент или curl:
  - [ ] Первая отправка возвращает `isFirst: true` и правильный `score`.
  - [ ] Повторная отправка с другими ответами возвращает `isFirst: false` и первый `score`. В БД одна строка.
  - [ ] `GET /api/quiz` не содержит `correctId`.
  - [ ] Невалидный ник или неверное количество ответов дают 400.
  - [ ] Лидерборд при равенстве баллов ставит выше того, кто прошёл раньше.

## Готово, когда

- [ ] Весь сценарий (quiz → submit → status → leaderboard) проходится через curl или REST-клиент.
- [ ] Повторная попытка не перезаписывает первую.
- [ ] Все сценарии ручной проверки пройдены.

## Артефакты

- Миграция `results`
- Модули `QuizModule`, `ParticipantModule` (или сервис), `LeaderboardModule`
- `apps/api/requests.http` для REST-клиента

## Риски / заметки

- Web-идентификация по нику не защищена: любой может отправить ответы под чужим ником первым. Для викторины среди друзей это приемлемо, Telegram-вариант надёжнее.
- Параллельные submit одного участника безопасны благодаря уникальному индексу и `ON CONFLICT`.
- Если `questions.json` изменится после запуска, `total` у старых записей будет другим. Храните `total` в каждой записи (как и запланировано).

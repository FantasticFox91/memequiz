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
- [x] Тип `Participant { source, externalId, nickname }` в `packages/shared`.
- [x] `ParticipantResolver` (сервис) или декоратор `@CurrentParticipant()`, через который контроллеры получают участника. Контроллеры не знают, откуда он взялся.
- [x] Web-вариант: ник берётся из тела или query-параметра, нормализуется в `externalId`: trim, схлопывание пробелов, Unicode NFKC, lower-case.
- [x] Оставить точку расширения под Telegram (этап 7): позже добавится ветка с `initData` (`resolveParticipant()` в `src/participant/participant.resolver.ts`).

### Эндпоинты
- [x] `GET /api/quiz`: список `PublicRound` (через `toPublicRound()`), внутри вопросы без `correctId`. Порядок раундов как в файле. Вопросы внутри раунда и варианты перемешиваются на каждый запрос (Fisher–Yates). Ответы идентифицируются по `questionId`/`optionId`, поэтому перемешивание безопасно. Фронт сохраняет порядок вопросов своей попытки в прогрессе, чтобы после перезагрузки он не менялся.
- [x] `GET /api/me/status?nickname=...`: `{ completed: false }` или `{ completed: true, result: { score, total, createdAt, nickname } }`.
- [x] `POST /api/quiz/submit`: тело `{ nickname, answers: [{ questionId, optionId }] }`.
  - [x] Баллы считаются только на сервере, по `questions.json`.
  - [x] Вставка через `prisma.$queryRaw`: `INSERT ... ON CONFLICT (source, external_id) DO NOTHING RETURNING *`. В Prisma нет нативного «do nothing + returning», а `upsert` и перехват `P2002` менее аккуратны.
  - [x] Если `RETURNING` вернул строку, ответ `{ result, isFirst: true }`.
  - [x] Если строки нет, прочитать существующую запись и ответить `{ result: <первый>, isFirst: false }`.
- [x] `GET /api/leaderboard?limit=50`: сортировка `score DESC, created_at ASC`, поля `nickname, score, total, createdAt, rank`.
- [x] Описать DTO ответов zod-схемами в `packages/shared`, чтобы фронт был типизирован.

### Валидация
- [x] Ник: длина 2–24 символа после trim. Допустимы буквы (латиница и кириллица), цифры, пробел, `_` и `-`. Запрещены пустые и состоящие из одних пробелов.
- [x] `answers.length` равно количеству вопросов.
- [x] Каждый `questionId` существует, без дублей.
- [x] Каждый `optionId` принадлежит своему вопросу.
- [x] Ошибки валидации возвращают 400 с понятным сообщением.

### Ручная проверка (автотесты не пишем)
- [x] Файл `apps/api/requests.http` со всеми запросами сценария для REST-клиента.
- [x] Нормализация ника: `"  Вася  "` и `"вася"` считаются одним участником.
- [x] Сценарии через REST-клиент или curl:
  - [x] Первая отправка возвращает `isFirst: true` и правильный `score`.
  - [x] Повторная отправка с другими ответами возвращает `isFirst: false` и первый `score`. В БД одна строка.
  - [x] `GET /api/quiz` не содержит `correctId`.
  - [x] Невалидный ник или неверное количество ответов дают 400.
  - [x] Лидерборд при равенстве баллов ставит выше того, кто прошёл раньше.

## Готово, когда

- [x] Весь сценарий (quiz → submit → status → leaderboard) проходится через curl или REST-клиент.
- [x] Повторная попытка не перезаписывает первую.
- [x] Все сценарии ручной проверки пройдены.

## Артефакты

- Миграция `results`
- Модули `QuizModule`, `ParticipantModule` (или сервис), `LeaderboardModule`
- `apps/api/requests.http` для REST-клиента

## Риски / заметки

- Web-идентификация по нику не защищена: любой может отправить ответы под чужим ником первым. Для викторины среди друзей это приемлемо, Telegram-вариант надёжнее.
- Параллельные submit одного участника безопасны благодаря уникальному индексу и `ON CONFLICT`.
- Если `questions.json` изменится после запуска, `total` у старых записей будет другим. Храните `total` в каждой записи (как и запланировано).
- curl из Git Bash на Windows портит кириллицу в `-d`: сервер видит не те символы и отвечает 400 на ник. Используйте `requests.http` или `--data-binary @file.json`.

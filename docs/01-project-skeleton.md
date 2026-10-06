# Этап 1. Каркас проекта ✅

**Оценка:** ≈3–4 ч

**Цель:** пустые фронт и бэк общаются друг с другом локально и в Docker.

## Зависимости

- Этап 0 нужен только для деплоя. Локально каркас можно делать параллельно.
- Локально установлены Node.js 22.12+, pnpm (через corepack) и Docker Desktop.

## Принятые решения

- **Версии:** Nest 12, Nuxt 4.5, Prisma 7.10 (8.0 пока RC), zod 4, TypeScript 6.0 (как в Nest CLI).
- **Модули:** api собирается в CommonJS (как шаблон Nest 12) и подключает ESM-пакеты через `require(esm)` из Node 22+. `packages/shared` собирается tsup сразу в ESM (для Nuxt) и CJS (для Nest).
- **Линтер:** oxlint на корне вместо ESLint (как в шаблоне Nest 12), форматтер Prettier.
- **Автотесты не пишем** (решение пользователя): Jest и spec-файлы убраны из шаблона.
- **Миграции:** применяются при старте контейнера api (`prisma migrate deploy && node dist/main.js`).
- **Caddy:** web-образ = `caddy:2-alpine` со статикой Nuxt в `/srv`. Конфиги в `deploy/caddy/` монтируются в контейнер.

## Задачи

### Репозиторий
- [x] `git init` в каталоге `memequiz` (ветка `main`).
- [x] Корневой `package.json` (`packageManager: pnpm@10.7.0`) и `pnpm-workspace.yaml` с `apps/*` и `packages/*`.
- [x] Структура `apps/web`, `apps/api`, `packages/shared`.
- [x] `.editorconfig`, `.gitignore`, `.dockerignore`, `.prettierrc`, `.oxlintrc.json`.
- [x] Корневые скрипты: `dev`, `build`, `lint`, `format`, `db:up`, `db:down`, `db:migrate`, `db:deploy`.

### packages/shared
- [x] Пакет `@memequiz/shared`, зависимость `zod`.
- [x] Схема `healthResponseSchema` и тип `HealthResponse`.
- [x] Сборка tsup в ESM и CJS с раздельными `.d.ts` и `.d.cts`. Проверено в Nest и Nuxt.

### Nuxt (apps/web)
- [x] Nuxt 4, структура каталога `app/`.
- [x] `ssr: false`, `runtimeConfig.public.apiBase = '/api'`, dev-сервер на порту 3001.
- [x] Pinia (`@pinia/nuxt`).
- [x] Базовый layout: контейнер до 480 px, safe area, цвета через CSS-переменные.
- [x] Страницы-заглушки: `/`, `/quiz`, `/result`, `/leaderboard`.
- [x] Composable `useApi()` (обёртка над `$fetch.create` с базовым URL).
- [x] Главная страница вызывает `/api/health` и показывает статус.
- [x] В dev `/api` проксируется на Nest через `nitro.devProxy`.
- [x] `nuxt generate` собирает статику в `.output/public` (с `200.html` для SPA-fallback).

### Nest (apps/api)
- [x] Nest 12 (сгенерирован CLI, затем почищен).
- [x] `app.setGlobalPrefix('api')`.
- [x] Глобальный `ZodValidationPipe` и хелпер `createZodDto(schema)` в `src/common/zod-validation.pipe.ts`.
- [x] ConfigModule: `isGlobal`, `validate` через zod-схему (`src/config/env.ts`). При невалидном env приложение падает. `.env` читается из `apps/api` или из корня монорепо.
- [x] Схема env: `NODE_ENV`, `PORT`, `DATABASE_URL`, опциональные `TELEGRAM_BOT_TOKEN`, `SHEETS_ENABLED`, `GOOGLE_SHEET_ID`, `GOOGLE_CREDENTIALS_PATH`.
- [x] `GET /api/health`: `{ status: 'ok', db: 'up' }`. Если БД недоступна, ответ 503 с `{ status: 'error', db: 'down' }`.
- [x] `enableShutdownHooks()`.

### БД (Prisma)
- [x] `prisma`, `@prisma/client`, `@prisma/adapter-pg` версии 7.10.0.
- [x] `prisma.config.ts` (схема, миграции, `DATABASE_URL`). Генератор `prisma-client` с `moduleFormat = "cjs"` пишет клиент в `src/generated/prisma` (в git не попадает).
- [x] `PrismaService` (наследник `PrismaClient` с `PrismaPg`-адаптером) и глобальный `PrismaModule`.
- [x] Первая миграция `init` сразу с моделью `Result` из этапа 3: уникальный индекс `(source, external_id)`, индекс для лидерборда, колонка `synced_at`.
- [x] Скрипты `db:generate`, `db:migrate`, `db:deploy`. `prisma generate` выполняется в `prebuild` и `dev`.

### Docker
- [x] `docker/api.Dockerfile`: `pnpm fetch` → `install --offline` → `build` → `pnpm deploy --prod --legacy` → runtime на `node:24-alpine` под пользователем `node`.
- [x] `docker/web.Dockerfile`: `nuxt generate` → образ `caddy:2-alpine` со статикой в `/srv`.
- [x] `docker-compose.yml` (prod): `caddy`, `api`, `postgres`. Наружу публикуется только 443 у Caddy, у Postgres портов наружу нет. Ротация логов, healthcheck Postgres, `depends_on: service_healthy`.
- [x] Volume `caddy_data` и `caddy_config` с теми же именами, что в этапе 0: на сервере переиспользуется уже выпущенный сертификат.
- [x] `docker-compose.dev.yml`: Postgres на `127.0.0.1:5432`.
- [x] `docker-compose.local.yml`: override для проверки prod-стека на http://localhost:8080 (`Caddyfile.local`, без TLS).
- [x] `deploy/caddy/app.caddy`: общие маршруты (`/api/*` → api, статика, SPA-fallback, `immutable` для `/_nuxt/*`, `no-cache` для остального).

### Env
- [x] `.env.example` со всеми переменными и комментариями.
- [x] `.env` и `secrets/` в `.gitignore`. Проверено через `git status`.
- [x] Корневой `README.md` с инструкцией по запуску.

## Готово, когда

- [x] `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build` поднимает caddy, api и postgres локально.
- [x] Фронт, открытый через Caddy, получает ответ от `/api/health`. Маршруты `/`, `/quiz`, `/leaderboard` и неизвестные пути отдают 200.
- [x] `pnpm dev` запускает shared (watch), api (watch) и web, `/api` проксируется.
- [x] Миграции применяются на чистой БД (при старте api-контейнера и через `db:migrate`).
- [x] В репозитории нет секретов.

## Артефакты

- `pnpm-workspace.yaml`, `apps/web`, `apps/api`, `packages/shared`
- `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`, миграция `init`
- `docker/api.Dockerfile`, `docker/web.Dockerfile`
- `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.local.yml`
- `deploy/caddy/{Caddyfile,Caddyfile.local,app.caddy}`
- `.env.example`, `README.md`

## Риски / заметки

- Образ api весит около 510 МБ: в runtime лежит CLI Prisma для миграций. При желании миграции можно вынести в отдельный одноразовый контейнер.
- В `packages/shared/tsconfig.json` стоит `ignoreDeprecations: "6.0"`: tsup при сборке `.d.ts` подставляет `baseUrl`, устаревший в TS 6. Убрать, когда tsup это исправит.
- В родительском каталоге `C:\Users\Grygo\Documents\Development\` лежит посторонний `node_modules`. Node может случайно взять оттуда пакет, которого нет в проекте. Если будут странные ошибки резолва, сначала проверьте этот каталог.
- На сервере сейчас работает Caddy из этапа 0 (сервис `caddy` в проекте `memequiz`). При деплое (этап 6) его заменит контейнер из этого compose.

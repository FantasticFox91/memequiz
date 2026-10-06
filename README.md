# MemeQuiz

Викторина по мемам: веб-версия и Telegram Mini App. План разработки — в [docs/](docs/README.md).

## Структура

```
apps/api         NestJS + Prisma (Postgres), префикс /api
apps/web         Nuxt (SPA, ssr: false), собирается в статику
packages/shared  общие zod-схемы и типы (ESM + CJS)
deploy/caddy     конфиги Caddy (prod и локальный)
docker/          Dockerfile для api и web (web = Caddy со статикой)
```

## Требования

- Node.js 22.12+ и pnpm (`corepack enable`)
- Docker Desktop

## Локальная разработка

```bash
cp .env.example .env
pnpm install
pnpm db:up          # Postgres в Docker (localhost:5432)
pnpm db:migrate     # применить миграции
pnpm dev            # shared (watch) + api :3000 + web :3001
```

Фронт: http://localhost:3001, запросы `/api/*` проксируются на Nest.

## Проверка prod-сборки локально

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Всё доступно на http://localhost:8080. Миграции применяются при старте контейнера api.

## Команды

| Команда | Что делает |
|---|---|
| `pnpm dev` | Режим разработки всех пакетов |
| `pnpm build` | Сборка shared → api → web |
| `pnpm lint` | oxlint |
| `pnpm format` | prettier |
| `pnpm db:up` / `db:down` | Запуск/остановка dev-Postgres |
| `pnpm db:migrate` | Создать и применить миграцию (dev) |
| `pnpm db:deploy` | Применить миграции (prod) |

## Секреты

`.env`, ключ Google и токен бота не коммитятся. Все переменные описаны в [.env.example](.env.example).

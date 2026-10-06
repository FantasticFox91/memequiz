# MemeQuiz — план разработки

Викторина по мемам: веб-версия и Telegram Mini App. Каждый участник проходит викторину один раз, засчитывается только первый результат. Результаты попадают в лидерборд и дублируются в Google Sheets.

## Стек

| Слой | Технология |
|---|---|
| Монорепо | pnpm workspaces: `apps/web`, `apps/api`, `packages/shared` |
| Фронт | Nuxt (`ssr: false`, `nuxt generate`), Pinia |
| Бэкенд | NestJS, глобальный префикс `/api` |
| Валидация | zod (env, DTO, общие схемы в `packages/shared`) |
| БД | PostgreSQL + Prisma (схема и миграции) |
| Веб-сервер | Caddy: HTTPS, статика фронта, reverse proxy на `/api` |
| Интеграции | Google Sheets API (`googleapis`, service account), Telegram WebApp |
| Инфраструктура | Docker, Docker Compose, ufw |

## Архитектура

```
Браузер / Telegram
        │ HTTPS
        ▼
     Caddy ──── /*      → статика Nuxt (index.html + /_nuxt/*)
        │
        └────── /api/*  → Nest (api:3000)
                              │
                              ├── PostgreSQL (results)
                              └── Google Sheets (лист Results, асинхронно + cron-дозапись)
```

**Участник** с самого начала описывается отдельной абстракцией `source + externalId + nickname`:
- `web`: `externalId` получается нормализацией ника;
- `tg`: `externalId` равен `user.id` из проверенного `initData`.

Поэтому Telegram (этап 7) добавляется поверх веб-версии без переделок.

## Этапы

| # | Этап | Оценка | Файл |
|---|---|---|---|
| 0 | Подготовка инфраструктуры ✅ | 2–3 ч | [00-infrastructure.md](00-infrastructure.md) |
| 1 | Каркас проекта ✅ | 3–4 ч | [01-project-skeleton.md](01-project-skeleton.md) |
| 2 | Контент викторины | 2–4 ч | [02-quiz-content.md](02-quiz-content.md) |
| 3 | Бэкенд: логика викторины | 4–6 ч | [03-backend-quiz-logic.md](03-backend-quiz-logic.md) |
| 4 | Фронт: веб-версия | 6–8 ч | [04-frontend-web.md](04-frontend-web.md) |
| 5 | Интеграция с Google Sheets | 3–4 ч | [05-google-sheets.md](05-google-sheets.md) |
| 6 | Деплой веб-версии | 2–3 ч | [06-deploy-web.md](06-deploy-web.md) |
| 7 | Telegram Mini App | 4–6 ч | [07-telegram-mini-app.md](07-telegram-mini-app.md) |
| 8 | Полировка и защита | 3–5 ч | [08-polish-and-protection.md](08-polish-and-protection.md) |

**Итого:** примерно 30–45 часов.

**MVP — этапы 0–6** (≈20–30 ч): рабочая веб-версия с Google Sheets, которую можно отправить друзьям. Этапы 7–8 добавляются поверх.

## Порядок и зависимости

```
0 ──► 1 ──► 2 ──► 3 ──► 4 ──► 6 ──► 7 ──► 8
                  └──► 5 ──┘
```

- Этапы 2 и 3 частично параллельны: формат вопросов нужен бэкенду, но подбор мемов можно делать параллельно.
- Этап 5 можно делать параллельно с этапом 4, нужен только готовый `submit` из этапа 3.
- Этап 6 нужен до этапа 7, потому что Telegram требует публичный HTTPS-адрес.

## Как пользоваться

Каждый файл этапа устроен одинаково: **Цель → Зависимости → Задачи → Готово, когда → Артефакты → Риски / заметки**. Отмечайте выполненные пункты `- [x]` прямо в файлах.

## Секреты

Не коммитятся ни при каких условиях:
- `TELEGRAM_BOT_TOKEN`
- JSON-ключ Google service account
- `.env` с паролями БД

В репозитории лежит только `.env.example`.

# Этап 6. Деплой веб-версии

**Оценка:** ≈2–3 ч

**Цель:** работающая веб-версия на сервере. Это уже полноценный fallback-вариант.

## Зависимости

- Этап 0: сервер, HTTPS, hostname.
- Этапы 1–5: приложение собирается в Docker, викторина проходится локально.

## Задачи

### Сборка образов
- [ ] Выбрать способ: GitHub Actions с публикацией в GHCR (рекомендуется) или локальная сборка с `docker save | ssh ... docker load`.
- [ ] Workflow `.github/workflows/build.yml`: на push в `main` собирать образы `api` и `web` (Caddy со статикой или отдельный образ статики) и пушить в `ghcr.io/<user>/memequiz-*`.
- [ ] Теги: `latest` и короткий SHA коммита.
- [ ] Кэш сборки (`cache-from: type=gha`).
- [ ] Сервер логинится в GHCR через Personal Access Token с правом `read:packages` (если пакет приватный).
- [ ] Учесть архитектуру сервера: если сервер ARM, собирать `linux/arm64` через buildx.

### Выкладка
- [ ] Скопировать на сервер `docker-compose.yml`, `Caddyfile` и `.env` (через `scp`, `.env` не из репозитория).
- [ ] Положить ключ Google в `secrets/` с правами `600`.
- [ ] `docker compose pull && docker compose up -d`.
- [ ] Применить миграции: `docker compose run --rm api pnpm db:deploy` (или `prisma migrate deploy` в entrypoint перед стартом api).
- [ ] Записать порядок обновления в `docs/` или `README` (pull → migrate → up).
- [ ] По желанию: скрипт `deploy.sh` или job в GitHub Actions, который делает выкладку по SSH.

### Caddyfile
- [ ] Блок сайта `<hostname>`.
- [ ] `handle /api/*` → `reverse_proxy api:3000`. Префикс не срезать, Nest ожидает `/api`.
- [ ] `handle` для статики: `root * /srv`, `try_files {path} /index.html` (SPA-fallback), `file_server`.
- [ ] Заголовки кэширования:
  - `/_nuxt/*` (файлы с хэшем): `Cache-Control: public, max-age=31536000, immutable`;
  - `index.html` и SPA-fallback: `Cache-Control: no-cache`;
  - `/memes/*`: умеренный кэш, например `max-age=86400`.
- [ ] `encode zstd gzip`.
- [ ] Базовые security-заголовки: `X-Content-Type-Options: nosniff`, `Referrer-Policy`. `X-Frame-Options` не ставить: он помешает Telegram Web.

### Бэкапы
- [ ] Скрипт `pg_dump` через `docker compose exec -T postgres pg_dump -Fc ...` в `/opt/memequiz/backups/` с датой в имени.
- [ ] Cron на хосте, раз в сутки.
- [ ] Ротация: хранить последние 7–14 дампов.
- [ ] Желательно копировать дампы за пределы сервера (rclone, другой хост хоумлаба).
- [ ] Один раз проверить восстановление (`pg_restore` в тестовую БД).
- [ ] Google Sheets остаётся дополнительной копией результатов.

### Логи
- [ ] В `docker-compose.yml` для всех сервисов: `logging: driver json-file, options: max-size: 10m, max-file: 3` (или глобально в `/etc/docker/daemon.json`).
- [ ] Nest логирует в stdout. Структурированные JSON-логи (pino) по желанию.

### Smoke-тест
- [ ] `curl https://<hostname>/api/health` возвращает `ok`.
- [ ] Пройти викторину с телефона через мобильный интернет (не Wi-Fi).
- [ ] Проверить, что результат появился в лидерборде и в Google Sheets.
- [ ] Проверить, что повторный вход с тем же ником ведёт на результат.
- [ ] Проверить заголовки кэша в DevTools (`/_nuxt/*` immutable, `index.html` no-cache).

## Готово, когда

- [ ] Ссылку можно отправить друзьям, и всё работает.
- [ ] Бэкап создаётся по cron и восстанавливается.
- [ ] Логи не растут бесконечно.

## Артефакты

- `.github/workflows/build.yml`
- Prod `Caddyfile`, `docker-compose.yml` на сервере
- `scripts/backup.sh`, cron-запись
- Образы в GHCR

## Риски / заметки

- Миграции перед стартом нового api: если миграция ломает обратную совместимость, будет простой. Для этого проекта приемлемо.
- Не забудьте, что `.env` на сервере — единственная копия prod-секретов. Продублируйте её в менеджер паролей.
- Порт Postgres не публикуется наружу. Если нужен доступ, используйте SSH-туннель.

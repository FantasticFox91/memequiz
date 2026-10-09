# Этап 6. Деплой веб-версии

**Оценка:** ≈2–3 ч

**Цель:** работающая веб-версия на сервере. Это уже полноценный fallback-вариант.

## Зависимости

- Этап 0: сервер, HTTPS, hostname.
- Этапы 1–5: приложение собирается в Docker, викторина проходится локально.

## Задачи

### Сборка образов
- [x] Способ: образы собираются прямо на сервере из git-клона (`docker compose up -d --build`). GHCR и GitHub Actions пока не нужны.
- [ ] По желанию позже: GitHub Actions с публикацией в GHCR, если сборка на сервере станет долгой.

### Выкладка
- [x] Репозиторий склонирован в `/opt/memequiz` (deploy key), рядом `.env` с правами `600` (не из репозитория).
- [x] Миграции применяются автоматически при старте контейнера api (`prisma migrate deploy` в CMD).
- [x] Порядок обновления:
  ```bash
  cd /opt/memequiz
  git pull
  docker compose up -d --build
  ```
- [ ] По желанию: скрипт `deploy.sh` или job в GitHub Actions, который делает выкладку по SSH.

### Caddyfile
- [x] Блок сайта `<hostname>` (`deploy/caddy/Caddyfile`, общие маршруты в `app.caddy`).
- [x] `handle /api/*` → `reverse_proxy api:3000`. Префикс не срезать, Nest ожидает `/api`.
- [x] `handle` для статики: `root * /srv`, `try_files {path} /200.html` (SPA-fallback), `file_server`.
- [x] Заголовки кэширования:
  - `/_nuxt/*` (файлы с хэшем): `Cache-Control: public, max-age=31536000, immutable`;
  - `index.html` и SPA-fallback: `Cache-Control: no-cache`;
  - `/memes/*`: `max-age=3600` (имена без хэша, замена картинки доезжает за час).
- [x] `encode zstd gzip`.
- [x] Базовые security-заголовки: `X-Content-Type-Options: nosniff`, `Referrer-Policy`. `X-Frame-Options` не ставить: он помешает Telegram Web.

### Бэкапы
- [x] `scripts/backup.sh`: `pg_dump -Fc` в `/opt/memequiz/backups/` с датой в имени. Восстановление описано в комментарии в начале скрипта.
- [x] Cron на хосте, раз в сутки:
  `15 3 * * * /opt/memequiz/scripts/backup.sh >> /opt/memequiz/backups/backup.log 2>&1`
- [x] Ротация: хранятся последние 14 дампов (`KEEP`).
- [ ] Копировать дампы за пределы сервера: `pnpm backup:pull` локально (`scripts/pull-backups.sh`, качает только новые дампы в `backups/`). Запускать хотя бы раз в неделю. Google Sheets как копии больше нет, так что это единственная защита от потери сервера.
- [x] Один раз проверить восстановление (`pg_restore` в тестовую БД).

### Логи
- [x] В `docker-compose.yml` для всех сервисов: `logging: driver json-file, options: max-size: 10m, max-file: 3` (или глобально в `/etc/docker/daemon.json`).
- [x] Nest логирует в stdout. Структурированные JSON-логи (pino) по желанию.

### Smoke-тест
- [x] `curl https://<hostname>/api/health` возвращает `ok`.
- [ ] Пройти викторину с телефона через мобильный интернет (не Wi-Fi).
- [ ] Проверить, что результат появился в лидерборде.
- [ ] Проверить, что повторный вход с тем же ником ведёт на результат.
- [x] Проверить заголовки кэша в DevTools (`/_nuxt/*` immutable, `index.html` no-cache).

## Готово, когда

- [ ] Ссылку можно отправить друзьям, и всё работает.
- [x] Бэкап создаётся по cron и восстанавливается.
- [x] Логи не растут бесконечно.

## Артефакты

- `.github/workflows/build.yml`
- Prod `Caddyfile`, `docker-compose.yml` на сервере
- `scripts/backup.sh`, cron-запись
- Образы в GHCR

## Риски / заметки

- Миграции перед стартом нового api: если миграция ломает обратную совместимость, будет простой. Для этого проекта приемлемо.
- Не забудьте, что `.env` на сервере — единственная копия prod-секретов. Продублируйте её в менеджер паролей.
- Порт Postgres не публикуется наружу. Если нужен доступ, используйте SSH-туннель.

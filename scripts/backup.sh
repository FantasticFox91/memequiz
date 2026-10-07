#!/usr/bin/env bash
# Дамп prod-БД в backups/ с ротацией. Запуск на сервере из cron:
#   15 3 * * * /opt/memequiz/scripts/backup.sh >> /opt/memequiz/backups/backup.log 2>&1
# Восстановление:
#   docker compose stop api
#   docker compose exec -T postgres pg_restore -U memequiz -d memequiz --clean --if-exists < backups/<файл>.dump
#   docker compose start api
set -euo pipefail

cd "$(dirname "$0")/.."

KEEP="${KEEP:-14}"
DIR=backups
mkdir -p "$DIR"
chmod 700 "$DIR"

set -a
. ./.env
set +a

FILE="$DIR/memequiz-$(date +%Y-%m-%d_%H-%M-%S).dump"

# пишем во временный файл, чтобы оборванный дамп не выглядел как готовый
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
chmod 600 "$FILE"

# оставляем последние $KEEP дампов
ls -1t "$DIR"/memequiz-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm --

echo "$(date -Is) ok $FILE ($(du -h "$FILE" | cut -f1))"

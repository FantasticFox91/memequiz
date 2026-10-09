#!/usr/bin/env bash
# Копия prod-дампов с сервера на локальную машину (вне сервера бэкапов больше нет).
# Запуск локально из корня репо (Git Bash на Windows тоже подходит): pnpm backup:pull
# Качает только дампы, которых ещё нет локально; локальные старые не удаляет.
set -euo pipefail

cd "$(dirname "$0")/.."

REMOTE="${REMOTE:-root@94.141.161.179}"
REMOTE_DIR="${REMOTE_DIR:-/opt/memequiz/backups}"
DIR="${DIR:-backups}"
mkdir -p "$DIR"

new=0
for name in $(ssh "$REMOTE" "cd $REMOTE_DIR && ls -1 memequiz-*.dump"); do
  [ -f "$DIR/$name" ] && continue
  # во временный файл: оборванная загрузка не должна выглядеть как готовый дамп
  scp -q "$REMOTE:$REMOTE_DIR/$name" "$DIR/$name.tmp"
  mv "$DIR/$name.tmp" "$DIR/$name"
  echo "+ $name"
  new=$((new + 1))
done

echo "скачано новых: $new, всего локально: $(ls -1 "$DIR"/memequiz-*.dump 2>/dev/null | wc -l)"

#!/usr/bin/env bash
# Удалить результат из лидерборда. Запуск на сервере из /opt/memequiz:
#   scripts/delete-result.sh --list            последние 30 результатов с id
#   scripts/delete-result.sh "Ник"             по нику, как он написан в лидерборде
#   scripts/delete-result.sh --id 42           по id из --list
# Перед удалением показывает запись и спрашивает подтверждение.
# Вместе с результатом удаляется отметка старта: участник сможет пройти заново, и время посчитается с нуля.
# Перед массовыми чистками сделайте бэкап: scripts/backup.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# SQL из stdin: в -c переменные psql (:'nick') не подставляются
psql_run() {
  docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 "$@"' psql "$@"
}

COLUMNS_SQL="id, source, nickname, score || '/' || total AS score, to_char(created_at AT TIME ZONE 'Europe/Moscow', 'DD.MM HH24:MI') AS created"

case "${1:-}" in
  --list)
    psql_run <<SQL
SELECT $COLUMNS_SQL FROM results ORDER BY created_at DESC LIMIT 30;
SQL
    exit 0
    ;;
  --id)
    [[ "${2:-}" =~ ^[0-9]+$ ]] || { echo "Нужен числовой id: $0 --id 42" >&2; exit 1; }
    VARS=(-v "id=$2")
    WHERE="id = :id"
    ;;
  "" | -h | --help)
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
  *)
    VARS=(-v "nick=$1")
    WHERE="nickname = :'nick'"
    ;;
esac

found=$(psql_run "${VARS[@]}" -At <<SQL
SELECT count(*) FROM results WHERE $WHERE;
SQL
)
if [ "$found" = "0" ]; then
  echo "Ничего не найдено. Ник нужен точно как в лидерборде; список с id: $0 --list" >&2
  exit 1
fi

psql_run "${VARS[@]}" <<SQL
SELECT $COLUMNS_SQL FROM results WHERE $WHERE;
SQL

read -r -p "Удалить ($found шт.)? [y/N] " answer
[ "$answer" = "y" ] || { echo "Отменено"; exit 0; }

psql_run "${VARS[@]}" <<SQL
BEGIN;
DELETE FROM quiz_starts s USING results r
  WHERE r.source = s.source AND r.external_id = s.external_id AND r.$WHERE;
DELETE FROM results WHERE $WHERE;
COMMIT;
SQL
echo "Готово"

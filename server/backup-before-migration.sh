#!/bin/sh
set -eu

MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME:-life_assistant_mysql}"
MYSQL_DATABASE="${MYSQL_DATABASE:-life_assistant}"
BACKUP_VERIFY_RESTORE="${BACKUP_VERIFY_RESTORE:-true}"
BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "backup file path is required"
  exit 1
fi

case "${MYSQL_DATABASE}" in
  ''|*[!A-Za-z0-9_%-]*)
    echo "MYSQL_DATABASE contains unsupported characters"
    exit 1
    ;;
esac

mkdir -p "$(dirname "${BACKUP_FILE}")"
TEMP_SQL="${BACKUP_FILE}.tmp.sql"
VERIFY_DATABASE="${MYSQL_DATABASE}_backup_verify_$(date -u +%Y%m%d%H%M%S)"

cleanup() {
  rm -f "${TEMP_SQL}"
  if [ "${BACKUP_VERIFY_RESTORE}" = "true" ] && [ -n "${VERIFY_DATABASE}" ]; then
    docker exec -e VERIFY_DATABASE="${VERIFY_DATABASE}" "${MYSQL_CONTAINER_NAME}" sh -c '
      if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
        export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
      elif [ -n "${MYSQL_ROOT_PASSWORD_FILE:-}" ] && [ -r "$MYSQL_ROOT_PASSWORD_FILE" ]; then
        export MYSQL_PWD="$(cat "$MYSQL_ROOT_PASSWORD_FILE")"
      else
        exit 0
      fi
      mysql -uroot -e "DROP DATABASE IF EXISTS \`$VERIFY_DATABASE\`" >/dev/null 2>&1 || true
    ' >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! docker inspect "${MYSQL_CONTAINER_NAME}" >/dev/null 2>&1; then
  echo "MySQL container not found: ${MYSQL_CONTAINER_NAME}"
  exit 1
fi

if ! docker exec "${MYSQL_CONTAINER_NAME}" sh -c 'command -v mysqldump >/dev/null && { [ -n "${MYSQL_ROOT_PASSWORD:-}" ] || [ -n "${MYSQL_ROOT_PASSWORD_FILE:-}" ]; }'; then
  echo "MySQL container must provide MYSQL_ROOT_PASSWORD or MYSQL_ROOT_PASSWORD_FILE"
  exit 1
fi

umask 077
if ! docker exec "${MYSQL_CONTAINER_NAME}" sh -c '
  if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
    export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  else
    export MYSQL_PWD="$(cat "$MYSQL_ROOT_PASSWORD_FILE")"
  fi
  mysqldump --single-transaction --routines --events --triggers --hex-blob "$1"
' sh "${MYSQL_DATABASE}" > "${TEMP_SQL}"; then
  echo "database dump failed"
  exit 1
fi

if [ ! -s "${TEMP_SQL}" ]; then
  echo "database dump is empty"
  exit 1
fi

gzip -c "${TEMP_SQL}" > "${BACKUP_FILE}"
gzip -t "${BACKUP_FILE}"
if ! gzip -dc "${BACKUP_FILE}" | grep -q 'CREATE TABLE'; then
  echo "backup does not contain table definitions"
  exit 1
fi

if [ "${BACKUP_VERIFY_RESTORE}" = "true" ]; then
  docker exec -e VERIFY_DATABASE="${VERIFY_DATABASE}" "${MYSQL_CONTAINER_NAME}" sh -c '
    if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
      export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
    else
      export MYSQL_PWD="$(cat "$MYSQL_ROOT_PASSWORD_FILE")"
    fi
    mysql -uroot -e "CREATE DATABASE \`$VERIFY_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  '

  if ! gzip -dc "${BACKUP_FILE}" | docker exec -i -e VERIFY_DATABASE="${VERIFY_DATABASE}" "${MYSQL_CONTAINER_NAME}" sh -c '
    if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
      export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
    else
      export MYSQL_PWD="$(cat "$MYSQL_ROOT_PASSWORD_FILE")"
    fi
    mysql -uroot "$VERIFY_DATABASE"
  '; then
    echo "backup restore verification failed"
    exit 1
  fi

  table_count="$(docker exec -e VERIFY_DATABASE="${VERIFY_DATABASE}" "${MYSQL_CONTAINER_NAME}" sh -c '
    if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
      export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
    else
      export MYSQL_PWD="$(cat "$MYSQL_ROOT_PASSWORD_FILE")"
    fi
    mysql -N -B -uroot -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '\''$VERIFY_DATABASE'\''"
  ')"
  case "${table_count}" in
    ''|0) echo "backup restore verification produced no tables"; exit 1 ;;
  esac
fi

echo "database backup created and verified: ${BACKUP_FILE}"

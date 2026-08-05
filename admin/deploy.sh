#!/bin/sh
set -eu

TARGET_DIR="${TARGET_DIR:-/www/wwwroot/life-assistant/admin-dist}"
PUBLIC_URL="${PUBLIC_URL:-https://www.xunhaoyou.com/admin/}"

if [ ! -f .release-id ]; then
  echo "missing .release-id"
  exit 1
fi

if [ ! -f admin-dist/index.html ]; then
  echo "missing admin-dist/index.html"
  exit 1
fi

case "${TARGET_DIR}" in
  /www/wwwroot/life-assistant/admin-dist) ;;
  *)
    echo "TARGET_DIR must be /www/wwwroot/life-assistant/admin-dist"
    exit 1
    ;;
esac

RELEASE_ID="$(tr -d '\r\n' < .release-id)"
if [ -z "${RELEASE_ID}" ]; then
  echo "release id is empty"
  exit 1
fi

STAGING_DIR="${TARGET_DIR}.staging.${RELEASE_ID}"
BACKUP_DIR="${TARGET_DIR}.previous.${RELEASE_ID}"

if [ -e "${STAGING_DIR}" ] || [ -e "${BACKUP_DIR}" ]; then
  echo "release target already exists for ${RELEASE_ID}"
  exit 1
fi

mkdir -p "$(dirname "${TARGET_DIR}")"
mkdir "${STAGING_DIR}"
cp -a admin-dist/. "${STAGING_DIR}/"

if [ ! -s "${STAGING_DIR}/index.html" ]; then
  echo "staged admin bundle is invalid"
  rmdir "${STAGING_DIR}"
  exit 1
fi

if [ -d "${TARGET_DIR}" ]; then
  mv "${TARGET_DIR}" "${BACKUP_DIR}"
fi
mv "${STAGING_DIR}" "${TARGET_DIR}"

if ! curl --fail --silent --show-error "${PUBLIC_URL}" >/dev/null; then
  echo "admin public health check failed"
  mv "${TARGET_DIR}" "${STAGING_DIR}"
  if [ -d "${BACKUP_DIR}" ]; then
    mv "${BACKUP_DIR}" "${TARGET_DIR}"
  fi
  echo "admin bundle restored from the previous version"
  exit 1
fi

echo "admin release ${RELEASE_ID} is live"
if [ -d "${BACKUP_DIR}" ]; then
  echo "previous admin bundle retained at ${BACKUP_DIR}"
fi

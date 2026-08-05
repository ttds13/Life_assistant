#!/bin/sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-life-assistant-server}"
CONTAINER_NAME="${CONTAINER_NAME:-life_assistant_server}"
PORT="${PORT:-3100}"
CANARY_PORT="${CANARY_PORT:-3101}"
DOCKER_NETWORK="${DOCKER_NETWORK:-life_assistant_net}"
IMAGE_TAR="${IMAGE_TAR:-life-assistant-server.tar}"
IMAGE_TAG="${IMAGE_TAG:-}"
ENV_FILE="${ENV_FILE:-.env.production}"
CERTS_DIR="${CERTS_DIR:-certs}"
BACKUP_DIR="${BACKUP_DIR:-/www/wwwroot/life-assistant/backups}"
MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME:-life_assistant_mysql}"
MYSQL_DATABASE="${MYSQL_DATABASE:-life_assistant}"
BACKUP_VERIFY_RESTORE="${BACKUP_VERIFY_RESTORE:-true}"
NODE_IMAGE="${NODE_IMAGE:-node:22-bookworm-slim}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-24}"
HEALTH_SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-2}"

if [ -z "${IMAGE_TAG}" ] && [ -f .image-tag ]; then
  IMAGE_TAG="$(tr -d '\r\n' < .image-tag)"
fi

if [ -z "${IMAGE_TAG}" ]; then
  echo "IMAGE_TAG is required (or provide .image-tag from the release package)"
  exit 1
fi

IMAGE_REF="${IMAGE_NAME}:${IMAGE_TAG}"
CANDIDATE_NAME="${CONTAINER_NAME}_candidate"

if [ ! -f "${ENV_FILE}" ]; then
  echo "missing ENV_FILE: ${ENV_FILE}"
  exit 1
fi

if [ ! -f "${CERTS_DIR}/apiclient_key.pem" ]; then
  echo "missing ${CERTS_DIR}/apiclient_key.pem"
  exit 1
fi

if [ ! -f "${CERTS_DIR}/wechatpay_public_key.pem" ]; then
  echo "missing ${CERTS_DIR}/wechatpay_public_key.pem"
  exit 1
fi

if [ "${CERTS_DIR#/}" = "${CERTS_DIR}" ]; then
  CERTS_MOUNT="$(pwd)/${CERTS_DIR}"
else
  CERTS_MOUNT="${CERTS_DIR}"
fi

if [ "${PORT}" = "${CANARY_PORT}" ]; then
  echo "CANARY_PORT must differ from PORT"
  exit 1
fi

if ! docker network inspect "${DOCKER_NETWORK}" >/dev/null 2>&1; then
  echo "docker network does not exist: ${DOCKER_NETWORK}"
  exit 1
fi

mkdir -p logs
mkdir -p uploads

if [ -f "${IMAGE_TAR}" ]; then
  docker load -i "${IMAGE_TAR}"
else
  docker build --build-arg "NODE_IMAGE=${NODE_IMAGE}" -t "${IMAGE_REF}" .
fi

if ! docker image inspect "${IMAGE_REF}" >/dev/null 2>&1; then
  echo "release image is unavailable: ${IMAGE_REF}"
  exit 1
fi

docker run --rm \
  --network "${DOCKER_NETWORK}" \
  --env-file "${ENV_FILE}" \
  -v "${CERTS_MOUNT}:/app/certs:ro" \
  --entrypoint node \
  "${IMAGE_REF}" scripts/release-preflight.cjs

BACKUP_FILE="${BACKUP_DIR}/life_assistant_before_$(date -u +%Y%m%d%H%M%S).sql.gz"
MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME}" \
MYSQL_DATABASE="${MYSQL_DATABASE}" \
BACKUP_VERIFY_RESTORE="${BACKUP_VERIFY_RESTORE}" \
  sh ./backup-before-migration.sh "${BACKUP_FILE}"

docker run --rm \
  --network "${DOCKER_NETWORK}" \
  --env-file "${ENV_FILE}" \
  -v "${CERTS_MOUNT}:/app/certs:ro" \
  --entrypoint npm \
  "${IMAGE_REF}" run prisma:migrate:deploy

run_app() {
  name="$1"
  host_port="$2"
  image="$3"
  docker run -d \
    --name "${name}" \
    --network "${DOCKER_NETWORK}" \
    --env-file "${ENV_FILE}" \
    -e RUN_MIGRATIONS_ON_START=false \
    -e SEED_ON_START=false \
    -p "127.0.0.1:${host_port}:3100" \
    -v "${CERTS_MOUNT}:/app/certs:ro" \
    -v "$(pwd)/uploads:/app/uploads" \
    -v "$(pwd)/logs:/app/logs" \
    --restart unless-stopped \
    "${image}"
}

wait_for_health() {
  host_port="$1"
  attempt=1
  while [ "${attempt}" -le "${HEALTH_RETRIES}" ]; do
    if curl --fail --silent --show-error "http://127.0.0.1:${host_port}${HEALTH_PATH}" >/dev/null; then
      return 0
    fi
    sleep "${HEALTH_SLEEP_SECONDS}"
    attempt=$((attempt + 1))
  done
  return 1
}

if docker ps -a --format '{{.Names}}' | grep -Fxq "${CANDIDATE_NAME}"; then
  docker rm -f "${CANDIDATE_NAME}"
fi

run_app "${CANDIDATE_NAME}" "${CANARY_PORT}" "${IMAGE_REF}"
if ! wait_for_health "${CANARY_PORT}"; then
  docker logs "${CANDIDATE_NAME}" --tail 100 || true
  docker rm -f "${CANDIDATE_NAME}"
  echo "candidate failed health checks; active service was not changed"
  exit 1
fi

PREVIOUS_IMAGE=""
if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
  PREVIOUS_IMAGE="$(docker inspect --format '{{.Image}}' "${CONTAINER_NAME}")"
  docker rm -f "${CONTAINER_NAME}"
fi

run_app "${CONTAINER_NAME}" "${PORT}" "${IMAGE_REF}"
if ! wait_for_health "${PORT}"; then
  docker logs "${CONTAINER_NAME}" --tail 100 || true
  docker rm -f "${CONTAINER_NAME}" || true
  if [ -n "${PREVIOUS_IMAGE}" ]; then
    echo "new release failed; restoring previous image ${PREVIOUS_IMAGE}"
    run_app "${CONTAINER_NAME}" "${PORT}" "${PREVIOUS_IMAGE}"
    wait_for_health "${PORT}" || true
  fi
  docker rm -f "${CANDIDATE_NAME}" || true
  exit 1
fi

docker rm -f "${CANDIDATE_NAME}"

docker ps --filter "name=${CONTAINER_NAME}" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'

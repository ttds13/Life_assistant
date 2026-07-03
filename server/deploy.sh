#!/bin/sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-life-assistant-server}"
CONTAINER_NAME="${CONTAINER_NAME:-life_assistant_server}"
PORT="${PORT:-3100}"
DOCKER_NETWORK="${DOCKER_NETWORK:-life_assistant_net}"
IMAGE_TAR="${IMAGE_TAR:-life-assistant-server.tar}"
NODE_IMAGE="${NODE_IMAGE:-node:22-bookworm-slim}"

if [ ! -f .env.production ]; then
  echo "missing .env.production"
  exit 1
fi

if [ ! -f certs/apiclient_key.pem ]; then
  echo "missing certs/apiclient_key.pem"
  exit 1
fi

if [ ! -f certs/wechatpay_public_key.pem ]; then
  echo "missing certs/wechatpay_public_key.pem"
  exit 1
fi

mkdir -p logs
mkdir -p uploads

if [ -f "${IMAGE_TAR}" ]; then
  docker load -i "${IMAGE_TAR}"
else
  docker build --build-arg "NODE_IMAGE=${NODE_IMAGE}" -t "${IMAGE_NAME}:latest" .
fi

if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
  docker rm -f "${CONTAINER_NAME}"
fi

docker run -d \
  --name "${CONTAINER_NAME}" \
  --network "${DOCKER_NETWORK}" \
  --env-file .env.production \
  -p 127.0.0.1:${PORT}:3100 \
  -v "$(pwd)/certs:/app/certs:ro" \
  -v "$(pwd)/uploads:/app/uploads" \
  -v "$(pwd)/logs:/app/logs" \
  --restart unless-stopped \
  "${IMAGE_NAME}:latest"

docker ps --filter "name=${CONTAINER_NAME}"

#!/bin/sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-life-assistant-server}"
TAR_NAME="${TAR_NAME:-life-assistant-server.tar}"
NODE_IMAGE="${NODE_IMAGE:-node:22-bookworm-slim}"

docker build --build-arg "NODE_IMAGE=${NODE_IMAGE}" -t "${IMAGE_NAME}:latest" .
docker save -o "${TAR_NAME}" "${IMAGE_NAME}:latest"

echo "saved ${IMAGE_NAME}:latest to ${TAR_NAME}"

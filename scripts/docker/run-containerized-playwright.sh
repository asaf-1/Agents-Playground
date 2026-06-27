#!/usr/bin/env bash

set -euo pipefail

image=${1:?runner image is required}
shift || true

container_command=${1:-npm run test:e2e}
workspace="${PLAYWRIGHT_WORKSPACE:-$PWD}"
volume_name="${PLAYWRIGHT_NODE_MODULES_VOLUME:-agentic-ai-demo-node-modules}"
shm_size="${PLAYWRIGHT_DOCKER_SHM_SIZE:-2g}"
host_uid="${HOST_UID:-$(id -u)}"
host_gid="${HOST_GID:-$(id -g)}"

docker volume inspect "$volume_name" >/dev/null 2>&1 || docker volume create "$volume_name" >/dev/null

docker run --rm --init \
  --shm-size="$shm_size" \
  -e CI=true \
  -e HOST_UID="$host_uid" \
  -e HOST_GID="$host_gid" \
  -e PLAYWRIGHT_TEST_COMMAND="$container_command" \
  -v "$workspace:/workspace" \
  -v "$volume_name:/workspace/node_modules" \
  -w /workspace \
  "$image" \
  bash -lc '
    set -euo pipefail
    status=0
    bash -lc "$PLAYWRIGHT_TEST_COMMAND" || status=$?

    for path in .artifacts test-results blob-report; do
      if [ -e "$path" ]; then
        chown -R "$HOST_UID:$HOST_GID" "$path" 2>/dev/null || chmod -R a+rwX "$path" 2>/dev/null || true
      fi
    done

    exit "$status"
  '

#!/usr/bin/env bash

# Stop on any error, an unset variable, or a failed pipe.
set -euo pipefail

# The image to run (required); the next word is the command to run in it.
image=${1:?runner image is required}
shift || true

# The command, the folder to mount, a volume for node_modules, the shared memory
# size, and this user's ids.
container_command=${1:-npm run test:e2e}
workspace="${PLAYWRIGHT_WORKSPACE:-$PWD}"
volume_name="${PLAYWRIGHT_NODE_MODULES_VOLUME:-agentic-ai-demo-node-modules}"
shm_size="${PLAYWRIGHT_DOCKER_SHM_SIZE:-2g}"
host_uid="${HOST_UID:-$(id -u)}"
host_gid="${HOST_GID:-$(id -g)}"

# Make the node_modules volume when it does not exist yet.
docker volume inspect "$volume_name" >/dev/null 2>&1 || docker volume create "$volume_name" >/dev/null

# Run the tests in the container, hand the result folders back to this user, and
# keep the tests' exit status.
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

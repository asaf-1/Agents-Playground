#!/usr/bin/env bash

set -euo pipefail

primary_image=${1:?primary image is required}
fallback_image=${2:-}
local_tag=${3:-agentic-ai-demo-playwright-local}

log() {
  printf '%s\n' "$*" >&2
}

pull_image() {
  local image="$1"
  if docker pull "$image" 1>&2; then
    echo "$image"
    return 0
  fi

  return 1
}

if pull_image "$primary_image" >/dev/null; then
  echo "$primary_image"
  exit 0
fi

if [[ -n "$fallback_image" ]] && pull_image "$fallback_image" >/dev/null; then
  echo "$fallback_image"
  exit 0
fi

log "Falling back to a local Dockerfile.e2e build."
docker build -f Dockerfile.e2e -t "$local_tag" . 1>&2
echo "$local_tag"

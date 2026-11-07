#!/usr/bin/env bash

# Stop on any error, an unset variable, or a failed pipe.
set -euo pipefail

# The image to try first (required), a fallback, and the tag for a local build.
primary_image=${1:?primary image is required}
fallback_image=${2:-}
local_tag=${3:-agentic-ai-demo-playwright-local}

# Messages go to stderr, so the output carries only the image name.
log() {
  printf '%s\n' "$*" >&2
}

# Pull an image, and print its name when that worked.
pull_image() {
  local image="$1"
  if docker pull "$image" 1>&2; then
    echo "$image"
    return 0
  fi

  return 1
}

# The first image, when it can be pulled.
if pull_image "$primary_image" >/dev/null; then
  echo "$primary_image"
  exit 0
fi

# Else the fallback, when one was given and can be pulled.
if [[ -n "$fallback_image" ]] && pull_image "$fallback_image" >/dev/null; then
  echo "$fallback_image"
  exit 0
fi

# Else build the image here from Dockerfile.e2e.
log "Falling back to a local Dockerfile.e2e build."
docker build -f Dockerfile.e2e -t "$local_tag" . 1>&2
echo "$local_tag"

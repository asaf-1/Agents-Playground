#!/usr/bin/env bash
# Installs a Playwright browser and the system packages it needs, on a GitHub
# Linux runner, with a time limit and retries.
#
#   bash scripts/ci/install-playwright-browser.sh chromium
#
# Why: `npx playwright install --with-deps` asks apt for about 20 MB of fonts.
# On most runners that takes under a second. On an unlucky one, Ubuntu's Azure
# package mirror (azure.archive.ubuntu.com) crawls: on 2026-10-26 one shard of
# PR #77 took 90 seconds for a 3.7 MB font and sat in this step for over ten
# minutes, as one had on PR #76, while the other shards finished in a minute.
#
# So each attempt gets a time limit (PLAYWRIGHT_INSTALL_LIMIT, 120 seconds by
# default). When an attempt runs out of time, the stalled apt is stopped, dpkg
# is put right, and the runner is pointed at Ubuntu's main mirror before the
# next attempt: retrying the same slow mirror would mostly stall again. Three
# attempts, then the step fails with a message saying what happened.
#
# A Linux runner only: it uses apt, sudo and GNU timeout.

set -uo pipefail

BROWSER="${1:-chromium}"
LIMIT="${PLAYWRIGHT_INSTALL_LIMIT:-120}"
ATTEMPTS=3
MAIN_MIRROR="http://archive.ubuntu.com/ubuntu"

# Stops whatever apt the timed-out attempt left running. sudo starts apt in
# its own session, so killing the npx process does not reach it.
stop_stalled_apt() {
  sudo pkill -TERM -f '/usr/lib/apt/methods/' 2>/dev/null || true
  sudo pkill -TERM -x apt-get 2>/dev/null || true
  sleep 3
  sudo pkill -KILL -f '/usr/lib/apt/methods/' 2>/dev/null || true
  sudo pkill -KILL -x apt-get 2>/dev/null || true
  sudo rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock \
    /var/cache/apt/archives/lock /var/lib/apt/lists/lock 2>/dev/null || true
  # A package interrupted half-way is finished or rolled back here.
  sudo dpkg --configure -a || true
}

# Points apt at Ubuntu's main mirror instead of the Azure copy. Ubuntu 24.04
# and later keep their sources in deb822 form; older images in sources.list.
use_main_mirror() {
  local file
  for file in /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list; do
    if [ -f "$file" ]; then
      sudo sed -i "s|http://azure.archive.ubuntu.com/ubuntu|$MAIN_MIRROR|g" "$file"
    fi
  done
  echo "Apt now reads from $MAIN_MIRROR."
}

for attempt in $(seq 1 "$ATTEMPTS"); do
  started=$(date +%s)
  echo "::group::Install Playwright $BROWSER, attempt $attempt of $ATTEMPTS (limit ${LIMIT}s)"
  timeout --kill-after=10 "$LIMIT" npx playwright install --with-deps "$BROWSER"
  status=$?
  echo "::endgroup::"
  took=$(( $(date +%s) - started ))

  if [ "$status" -eq 0 ]; then
    echo "Playwright $BROWSER installed in ${took}s on attempt $attempt."
    exit 0
  fi

  if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
    echo "::warning::Installing Playwright $BROWSER ran past ${LIMIT}s on attempt $attempt (Ubuntu's package mirror is slow on this runner). Stopping it and retrying from Ubuntu's main mirror."
  else
    echo "::warning::Installing Playwright $BROWSER failed on attempt $attempt (exit $status) after ${took}s. Retrying from Ubuntu's main mirror."
  fi

  stop_stalled_apt
  use_main_mirror
done

echo "::error::Playwright $BROWSER could not be installed in $ATTEMPTS attempts of up to ${LIMIT}s each."
exit 1

#!/usr/bin/env bash
# Installs a Playwright browser and the system packages it needs, on a GitHub
# Linux runner, with a time limit and retries.
#
#   bash scripts/ci/install-playwright-browser.sh chromium
#
# Why: `npx playwright install --with-deps` asks apt for about 25 MB of fonts.
# On most runners that takes seconds. On an unlucky one, Ubuntu's Azure
# package mirror (azure.archive.ubuntu.com) crawls: 3.7 MB in 90 seconds, and a
# shard sat in this step for ten minutes on PR #76 and PR #77.
#
# So each attempt gets a time limit (PLAYWRIGHT_INSTALL_LIMIT, 120 seconds by
# default). When one runs out, the stalled apt is stopped, dpkg is put right,
# and apt is moved off the Azure mirror onto Ubuntu's main one before the next
# attempt. Packages that finished downloading are kept, so a retry fetches only
# the rest. Three attempts, then the step fails with a message saying why.
#
# Where the mirror is set: GitHub's Ubuntu images list it in
# /etc/apt/apt-mirrors.txt (apt's "mirror+file" method, "Mirrorlist" in the
# log), not in the sources files. v1.25.1 edited only the sources files, so on
# PR #79 all three attempts went back to the same slow mirror. The switch now
# rewrites every file under /etc/apt that names the Azure mirror, then checks
# that none is left and prints the sources apt will use.
#
# A Linux runner only: it uses apt, sudo and GNU timeout. APT_DIR and SUDO are
# there for a local test of the mirror switch on a copy of those files.

set -uo pipefail

BROWSER="${1:-chromium}"
LIMIT="${PLAYWRIGHT_INSTALL_LIMIT:-120}"
ATTEMPTS=3
APT_DIR="${APT_DIR:-/etc/apt}"
SUDO="${SUDO-sudo}"
AZURE='https?://azure\.archive\.ubuntu\.com/ubuntu'
MAIN_MIRROR="http://archive.ubuntu.com/ubuntu"

# Stops whatever apt the timed-out attempt left running. sudo starts apt in
# its own session, so killing the npx process does not reach it. The [/] keeps
# the pattern from matching this pkill's own command line, which would
# otherwise kill the sudo running it.
stop_stalled_apt() {
  $SUDO pkill -TERM -f '[/]usr/lib/apt/methods/' 2>/dev/null || true
  $SUDO pkill -TERM -x apt-get 2>/dev/null || true
  sleep 3
  $SUDO pkill -KILL -f '[/]usr/lib/apt/methods/' 2>/dev/null || true
  $SUDO pkill -KILL -x apt-get 2>/dev/null || true
  $SUDO rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock \
    /var/cache/apt/archives/lock /var/lib/apt/lists/lock 2>/dev/null || true
  # A package interrupted half-way is finished or rolled back here.
  $SUDO dpkg --configure -a || true
}

# Moves apt off the Azure mirror: every text file under APT_DIR that names it
# (the mirror list, deb822 .sources files, an old sources.list) gets Ubuntu's
# main mirror instead. Then it checks the result rather than assuming it.
use_main_mirror() {
  local file left
  grep -rlIE "$AZURE" "$APT_DIR" 2>/dev/null | while IFS= read -r file; do
    $SUDO sed -i -E "s#${AZURE}#${MAIN_MIRROR}#g" "$file"
    echo "Switched $file to $MAIN_MIRROR."
  done
  left=$(grep -rlIE "$AZURE" "$APT_DIR" 2>/dev/null || true)
  if [ -n "$left" ]; then
    echo "::warning::The Azure mirror is still named in: $left"
  fi
  echo "Apt now reads from:"
  grep -rhIE '^(URIs:|deb |https?://)' "$APT_DIR" 2>/dev/null | sort -u | sed 's/^/  /'
}

main() {
  local attempt started status took
  for attempt in $(seq 1 "$ATTEMPTS"); do
    started=$(date +%s)
    echo "::group::Install Playwright $BROWSER, attempt $attempt of $ATTEMPTS (limit ${LIMIT}s)"
    timeout --kill-after=10 "$LIMIT" npx playwright install --with-deps "$BROWSER"
    status=$?
    echo "::endgroup::"
    took=$(($(date +%s) - started))

    if [ "$status" -eq 0 ]; then
      echo "Playwright $BROWSER installed in ${took}s on attempt $attempt."
      return 0
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
  return 1
}

# Run when executed; a test can source the file and call one function.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main
  exit $?
fi

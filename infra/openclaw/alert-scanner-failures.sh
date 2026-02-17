#!/usr/bin/env bash
set -euo pipefail

TELEGRAM_TARGET="${TELEGRAM_TARGET:-593360085}"
COOLDOWN_SECONDS="${COOLDOWN_SECONDS:-120}"
STATE_FILE="${STATE_FILE:-/tmp/alcomatcher-openclaw-alert.state}"

send_alert() {
  local message="$1"
  openclaw message send -t "${TELEGRAM_TARGET}" -m "${message}" >/dev/null 2>&1 || true
}

should_alert() {
  local now
  now="$(date +%s)"
  if [[ ! -f "${STATE_FILE}" ]]; then
    echo "${now}" > "${STATE_FILE}"
    return 0
  fi

  local last
  last="$(cat "${STATE_FILE}")"
  if (( now - last >= COOLDOWN_SECONDS )); then
    echo "${now}" > "${STATE_FILE}"
    return 0
  fi

  return 1
}

docker compose -f /opt/alcomatcher/docker-compose.yml logs -f --since=5m nginx app 2>&1 | while IFS= read -r line; do
  if [[ "${line}" == *"client intended to send too large body"* ]] || [[ "${line}" == *"scanner_quick_check_failed"* ]] || [[ "${line}" == *"LIMIT_FILE_SIZE"* ]]; then
    if should_alert; then
      send_alert "AlcoMatcher scanner alert: ${line}"
    fi
  fi
done

#!/usr/bin/env bash
set -euo pipefail

TELEGRAM_TARGET="${TELEGRAM_TARGET:-593360085}"
OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <message>" >&2
  exit 1
fi

message="$*"

send_via_openclaw() {
  local text="$1"
  if command -v openclaw >/dev/null 2>&1; then
    openclaw message send -t "${TELEGRAM_TARGET}" -m "${text}"
    return $?
  fi

  if [[ -s "/home/${OPENCLAW_USER}/.nvm/nvm.sh" ]]; then
    if command -v runuser >/dev/null 2>&1; then
      runuser -u "${OPENCLAW_USER}" -- /bin/bash -lc \
        "source /home/${OPENCLAW_USER}/.nvm/nvm.sh && nvm use default >/dev/null && openclaw message send -t '${TELEGRAM_TARGET}' -m \"${text}\""
      return $?
    fi
    if command -v sudo >/dev/null 2>&1; then
      sudo -u "${OPENCLAW_USER}" /bin/bash -lc \
        "source /home/${OPENCLAW_USER}/.nvm/nvm.sh && nvm use default >/dev/null && openclaw message send -t '${TELEGRAM_TARGET}' -m \"${text}\""
      return $?
    fi
  fi

  return 127
}

if ! send_via_openclaw "${message}" >/dev/null 2>&1; then
  echo "openclaw_send_failed target=${TELEGRAM_TARGET}" >&2
fi

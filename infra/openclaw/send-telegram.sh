#!/usr/bin/env bash
set -euo pipefail

TELEGRAM_TARGET="${TELEGRAM_TARGET:-593360085}"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <message>" >&2
  exit 1
fi

message="$*"
openclaw message send -t "${TELEGRAM_TARGET}" -m "${message}" >/dev/null 2>&1 || true

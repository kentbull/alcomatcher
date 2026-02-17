#!/usr/bin/env bash
set -euo pipefail

ALERT_STATE_DIR="${ALERT_STATE_DIR:-/var/tmp/alcomatcher-openclaw/state}"
INFO_COOLDOWN_SECONDS="${INFO_COOLDOWN_SECONDS:-900}"
WARN_COOLDOWN_SECONDS="${WARN_COOLDOWN_SECONDS:-600}"
CRITICAL_COOLDOWN_SECONDS="${CRITICAL_COOLDOWN_SECONDS:-300}"

state_init() {
  mkdir -p "${ALERT_STATE_DIR}/last_sent" "${ALERT_STATE_DIR}/active"
}

state_key() {
  local raw="$1"
  echo "${raw//[^a-zA-Z0-9_.-]/_}"
}

cooldown_for_severity() {
  local severity="$1"
  case "${severity}" in
    info) echo "${INFO_COOLDOWN_SECONDS}" ;;
    warn) echo "${WARN_COOLDOWN_SECONDS}" ;;
    critical) echo "${CRITICAL_COOLDOWN_SECONDS}" ;;
    *) echo "${WARN_COOLDOWN_SECONDS}" ;;
  esac
}

should_send_alert() {
  local severity="$1"
  local code="$2"
  local key
  key="$(state_key "${severity}.${code}")"
  local file="${ALERT_STATE_DIR}/last_sent/${key}.epoch"
  local now
  now="$(date +%s)"
  local cooldown
  cooldown="$(cooldown_for_severity "${severity}")"

  if [[ ! -f "${file}" ]]; then
    echo "${now}" > "${file}"
    return 0
  fi

  local last
  last="$(cat "${file}")"
  if (( now - last >= cooldown )); then
    echo "${now}" > "${file}"
    return 0
  fi

  return 1
}

is_incident_active() {
  local code="$1"
  local file="${ALERT_STATE_DIR}/active/$(state_key "${code}").active"
  [[ -f "${file}" ]]
}

mark_incident_active() {
  local code="$1"
  local file="${ALERT_STATE_DIR}/active/$(state_key "${code}").active"
  date --iso-8601=seconds > "${file}"
}

mark_incident_cleared() {
  local code="$1"
  local file="${ALERT_STATE_DIR}/active/$(state_key "${code}").active"
  rm -f "${file}"
}

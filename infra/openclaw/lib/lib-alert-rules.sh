#!/usr/bin/env bash
set -euo pipefail

WINDOW_SECONDS="${WINDOW_SECONDS:-900}"
HEALTH_FAIL_THRESHOLD="${HEALTH_FAIL_THRESHOLD:-3}"
HTTP_5XX_THRESHOLD="${HTTP_5XX_THRESHOLD:-20}"
SCANNER_FAIL_THRESHOLD="${SCANNER_FAIL_THRESHOLD:-5}"
SYNC_FAILED_DELTA_THRESHOLD="${SYNC_FAILED_DELTA_THRESHOLD:-5}"
TELEMETRY_COMPLETE_MIN_PCT="${TELEMETRY_COMPLETE_MIN_PCT:-90}"
SLO_P50_LIMIT_MS="${SLO_P50_LIMIT_MS:-5000}"
SLO_P95_LIMIT_MS="${SLO_P95_LIMIT_MS:-8000}"

rules_init() {
  local state_dir="$1"
  mkdir -p "${state_dir}"
  : > "${state_dir}/window_events.log"
  echo 0 > "${state_dir}/health_fail_consecutive"
  echo 0 > "${state_dir}/last_sync_failed"
}

window_add_event() {
  local state_dir="$1"
  local event_type="$2"
  local now
  now="$(date +%s)"
  echo "${now},${event_type}" >> "${state_dir}/window_events.log"
}

window_prune() {
  local state_dir="$1"
  local now
  now="$(date +%s)"
  local cutoff=$(( now - WINDOW_SECONDS ))
  local tmp
  tmp="${state_dir}/window_events.log.tmp"
  awk -F, -v c="${cutoff}" 'NF>=2 && $1+0>=c {print $0}' "${state_dir}/window_events.log" > "${tmp}" || true
  mv "${tmp}" "${state_dir}/window_events.log"
}

window_count() {
  local state_dir="$1"
  local event_type="$2"
  awk -F, -v t="${event_type}" 'NF>=2 && $2==t {c++} END {print c+0}' "${state_dir}/window_events.log"
}

update_health_state() {
  local state_dir="$1"
  local healthy="$2"
  local file="${state_dir}/health_fail_consecutive"
  local cur
  cur="$(cat "${file}" 2>/dev/null || echo 0)"
  if [[ "${healthy}" == "1" ]]; then
    echo 0 > "${file}"
  else
    echo $((cur + 1)) > "${file}"
  fi
}

health_fail_consecutive() {
  local state_dir="$1"
  cat "${state_dir}/health_fail_consecutive" 2>/dev/null || echo 0
}

sync_failed_delta() {
  local state_dir="$1"
  local current="$2"
  local file="${state_dir}/last_sync_failed"
  local prev
  prev="$(cat "${file}" 2>/dev/null || echo 0)"
  echo "${current}" > "${file}"
  if (( current < prev )); then
    echo 0
    return
  fi
  echo $(( current - prev ))
}

telemetry_complete_pct() {
  local complete="$1"
  local partial="$2"
  local total=$(( complete + partial ))
  if (( total <= 0 )); then
    echo 100
    return
  fi
  awk -v c="${complete}" -v t="${total}" 'BEGIN { printf "%.0f", (c/t)*100 }'
}

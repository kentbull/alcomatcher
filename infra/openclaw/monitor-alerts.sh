#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/lib-alert-state.sh
source "${SCRIPT_DIR}/lib/lib-alert-state.sh"
# shellcheck source=lib/lib-alert-rules.sh
source "${SCRIPT_DIR}/lib/lib-alert-rules.sh"

TELEGRAM_TARGET="${TELEGRAM_TARGET:-593360085}"
API_BASE="${API_BASE:-http://127.0.0.1:3000}"
POLL_SECONDS="${POLL_SECONDS:-60}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/alcomatcher/docker-compose.yml}"
STATE_DIR="${ALERT_STATE_DIR:-/var/tmp/alcomatcher-openclaw/state}"

state_init
rules_init "${STATE_DIR}"

send_message() {
  local text="$1"
  TELEGRAM_TARGET="${TELEGRAM_TARGET}" "${SCRIPT_DIR}/send-telegram.sh" "${text}"
}

emit_alert() {
  local severity="$1"
  local code="$2"
  local message="$3"
  if should_send_alert "${severity}" "${code}"; then
    send_message "[${severity^^}] ${code} | ${message}"
  fi
}

set_condition() {
  local code="$1"
  local severity="$2"
  local triggered="$3"
  local active_msg="$4"
  local clear_msg="$5"

  if [[ "${triggered}" == "1" ]]; then
    if ! is_incident_active "${code}"; then
      mark_incident_active "${code}"
      emit_alert "${severity}" "${code}" "${active_msg}"
    fi
  else
    if is_incident_active "${code}"; then
      mark_incident_cleared "${code}"
      emit_alert "info" "INFO_RECOVERY.${code}" "${clear_msg}"
    fi
  fi
}

extract_kpi_number() {
  local body="$1"
  local pattern="$2"
  local value
  value="$(printf '%s' "${body}" | sed -n "s/.*${pattern}.*/\\1/p" | head -n1)"
  if [[ -z "${value}" ]]; then
    echo 0
  else
    echo "${value}"
  fi
}

process_recent_logs() {
  local since_seconds="$1"
  local logs
  logs="$(docker compose -f "${COMPOSE_FILE}" logs --since="${since_seconds}s" nginx app 2>/dev/null || true)"
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue

    if [[ "${line}" =~ [[:space:]]5[0-9][0-9][[:space:]] ]] || [[ "${line}" == *"HTTP/1.1\" 5"* ]]; then
      window_add_event "${STATE_DIR}" "http_5xx"
    fi

    if [[ "${line}" == *"scanner_quick_check_failed"* ]] || [[ "${line}" == *"scan_finalize_failed"* ]] || [[ "${line}" == *"scan_image_upload_failed"* ]] || [[ "${line}" == *"LIMIT_FILE_SIZE"* ]] || [[ "${line}" == *"client intended to send too large body"* ]]; then
      window_add_event "${STATE_DIR}" "scanner_fail"
    fi
  done <<< "${logs}"
}

run_once() {
  local healthy=1
  if ! curl -fsS "${API_BASE}/health" >/dev/null 2>&1; then
    healthy=0
  fi
  update_health_state "${STATE_DIR}" "${healthy}"

  process_recent_logs "$((POLL_SECONDS + 5))"
  window_prune "${STATE_DIR}"

  local fail_streak
  fail_streak="$(health_fail_consecutive "${STATE_DIR}")"
  local count_5xx
  count_5xx="$(window_count "${STATE_DIR}" "http_5xx")"
  local count_scanner_fail
  count_scanner_fail="$(window_count "${STATE_DIR}" "scanner_fail")"

  local kpi
  kpi="$(curl -fsS "${API_BASE}/api/admin/kpis?windowHours=1" 2>/dev/null || echo '{}')"

  local scan_p50 scan_p95 decision_p95 sync_failed telemetry_complete telemetry_partial telemetry_pct
  scan_p50="$(extract_kpi_number "${kpi}" '\"scanPerformance\":{[^}]*\"p50Ms\":\([0-9]\+\)')"
  scan_p95="$(extract_kpi_number "${kpi}" '\"scanPerformance\":{[^}]*\"p95Ms\":\([0-9]\+\)')"
  decision_p95="$(extract_kpi_number "${kpi}" '\"decisionTotalMs\":{[^}]*\"p95Ms\":\([0-9]\+\)')"
  sync_failed="$(extract_kpi_number "${kpi}" '\"syncHealth\":{[^}]*\"sync_failed\":\([0-9]\+\)')"
  telemetry_complete="$(extract_kpi_number "${kpi}" '\"telemetryQuality\":{[^}]*\"complete\":\([0-9]\+\)')"
  telemetry_partial="$(extract_kpi_number "${kpi}" '\"telemetryQuality\":{[^}]*\"partial\":\([0-9]\+\)')"
  telemetry_pct="$(telemetry_complete_pct "${telemetry_complete}" "${telemetry_partial}")"

  local sync_delta
  sync_delta="$(sync_failed_delta "${STATE_DIR}" "${sync_failed}")"

  local reason_window="window=${WINDOW_SECONDS}s health_fail_streak=${fail_streak} 5xx=${count_5xx} scanner_fail=${count_scanner_fail} scan_p50=${scan_p50} scan_p95=${scan_p95} decision_p95=${decision_p95} sync_failed=${sync_failed} telemetry_complete_pct=${telemetry_pct}"

  local critical_health=0 critical_5xx=0 critical_slo=0 warn_scanner=0 warn_sync=0 warn_telemetry=0

  (( fail_streak >= HEALTH_FAIL_THRESHOLD )) && critical_health=1
  (( count_5xx >= HTTP_5XX_THRESHOLD )) && critical_5xx=1
  if (( scan_p50 > SLO_P50_LIMIT_MS || scan_p95 > SLO_P95_LIMIT_MS || decision_p95 > SLO_P95_LIMIT_MS )); then
    critical_slo=1
  fi

  (( count_scanner_fail >= SCANNER_FAIL_THRESHOLD )) && warn_scanner=1
  (( sync_delta >= SYNC_FAILED_DELTA_THRESHOLD )) && warn_sync=1
  if (( telemetry_pct < TELEMETRY_COMPLETE_MIN_PCT )); then
    warn_telemetry=1
  fi

  set_condition "CRITICAL_HEALTH_DOWN" "critical" "${critical_health}" "health check failing (${reason_window})" "health restored (${reason_window})"
  set_condition "CRITICAL_5XX_BURST" "critical" "${critical_5xx}" "5xx burst detected (${reason_window})" "5xx burst recovered (${reason_window})"
  set_condition "CRITICAL_SLO_BREACH" "critical" "${critical_slo}" "scanner latency SLO breached (${reason_window})" "scanner latency recovered (${reason_window})"
  set_condition "WARN_SCANNER_FAILURE_RATE" "warn" "${warn_scanner}" "scanner failure rate elevated (${reason_window})" "scanner failure rate normalized (${reason_window})"
  set_condition "WARN_SYNC_FAIL_GROWTH" "warn" "${warn_sync}" "sync_failed growth detected delta=${sync_delta} (${reason_window})" "sync_failed growth normalized (${reason_window})"
  set_condition "WARN_TELEMETRY_PARTIAL_HIGH" "warn" "${warn_telemetry}" "telemetry completeness low (${reason_window})" "telemetry completeness recovered (${reason_window})"
}

run_drill() {
  emit_alert "warn" "WARN_SCANNER_FAILURE_RATE" "DRILL: synthetic warning event"
  emit_alert "critical" "CRITICAL_HEALTH_DOWN" "DRILL: synthetic critical event"
  emit_alert "info" "INFO_RECOVERY.DRILL" "DRILL: synthetic recovery event"
}

if [[ "${1:-}" == "--drill" ]]; then
  run_drill
  exit 0
fi

while true; do
  run_once || true
  sleep "${POLL_SECONDS}"
done

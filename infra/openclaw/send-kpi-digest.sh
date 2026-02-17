#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_BASE="${API_BASE:-http://127.0.0.1:3000}"
TELEGRAM_TARGET="${TELEGRAM_TARGET:-593360085}"
ALERT_STATE_DIR="${ALERT_STATE_DIR:-/var/tmp/alcomatcher-openclaw/state}"
DIGEST_WINDOW_HOURS="${DIGEST_WINDOW_HOURS:-24}"
SNAPSHOT_FILE="${ALERT_STATE_DIR}/digest_snapshot.state"

mkdir -p "${ALERT_STATE_DIR}"

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

kpi="$(curl -fsS "${API_BASE}/api/admin/kpis?windowHours=${DIGEST_WINDOW_HOURS}" 2>/dev/null || echo '{}')"

apps_total="$(extract_kpi_number "${kpi}" '\"totals\":{[^}]*\"applications\":\([0-9]\+\)')"
quick_checks="$(extract_kpi_number "${kpi}" '\"totals\":{[^}]*\"quickChecks\":\([0-9]\+\)')"
scan_p50="$(extract_kpi_number "${kpi}" '\"scanPerformance\":{[^}]*\"p50Ms\":\([0-9]\+\)')"
scan_p95="$(extract_kpi_number "${kpi}" '\"scanPerformance\":{[^}]*\"p95Ms\":\([0-9]\+\)')"
decision_p50="$(extract_kpi_number "${kpi}" '\"decisionTotalMs\":{[^}]*\"p50Ms\":\([0-9]\+\)')"
decision_p95="$(extract_kpi_number "${kpi}" '\"decisionTotalMs\":{[^}]*\"p95Ms\":\([0-9]\+\)')"
fallback_rate_raw="$(extract_kpi_number "${kpi}" '\"fallbackRate\":\([0-9.]*\)')"
avg_conf_raw="$(extract_kpi_number "${kpi}" '\"avgConfidence\":\([0-9.]*\)')"
telemetry_complete="$(extract_kpi_number "${kpi}" '\"telemetryQuality\":{[^}]*\"complete\":\([0-9]\+\)')"
telemetry_partial="$(extract_kpi_number "${kpi}" '\"telemetryQuality\":{[^}]*\"partial\":\([0-9]\+\)')"
synced="$(extract_kpi_number "${kpi}" '\"syncHealth\":{[^}]*\"synced\":\([0-9]\+\)')"
pending_sync="$(extract_kpi_number "${kpi}" '\"syncHealth\":{[^}]*\"pending_sync\":\([0-9]\+\)')"
sync_failed="$(extract_kpi_number "${kpi}" '\"syncHealth\":{[^}]*\"sync_failed\":\([0-9]\+\)')"

fallback_rate_pct="$(awk -v v="${fallback_rate_raw}" 'BEGIN { printf "%.1f", (v+0)*100 }')"
avg_conf_pct="$(awk -v v="${avg_conf_raw}" 'BEGIN { printf "%.1f", (v+0)*100 }')"

prev_quick_checks=0
prev_sync_failed=0
prev_pending_sync=0
if [[ -f "${SNAPSHOT_FILE}" ]]; then
  prev_quick_checks="$(awk -F= '$1=="quick_checks" {print $2}' "${SNAPSHOT_FILE}" | head -n1)"
  prev_sync_failed="$(awk -F= '$1=="sync_failed" {print $2}' "${SNAPSHOT_FILE}" | head -n1)"
  prev_pending_sync="$(awk -F= '$1=="pending_sync" {print $2}' "${SNAPSHOT_FILE}" | head -n1)"
  : "${prev_quick_checks:=0}"
  : "${prev_sync_failed:=0}"
  : "${prev_pending_sync:=0}"
fi

delta_quick=$(( quick_checks - prev_quick_checks ))
delta_sync_failed=$(( sync_failed - prev_sync_failed ))
delta_pending=$(( pending_sync - prev_pending_sync ))

cat > "${SNAPSHOT_FILE}" <<SNAP
quick_checks=${quick_checks}
sync_failed=${sync_failed}
pending_sync=${pending_sync}
SNAP

now="$(date --iso-8601=seconds)"
message="[INFO] KPI_DIGEST | ${now} | window=${DIGEST_WINDOW_HOURS}h
apps=${apps_total} quick_checks=${quick_checks} (delta=${delta_quick})
scan_p50=${scan_p50}ms scan_p95=${scan_p95}ms decision_p50=${decision_p50}ms decision_p95=${decision_p95}ms
fallback_rate=${fallback_rate_pct}% avg_confidence=${avg_conf_pct}% telemetry_complete=${telemetry_complete} telemetry_partial=${telemetry_partial}
sync: synced=${synced} pending=${pending_sync} (delta=${delta_pending}) failed=${sync_failed} (delta=${delta_sync_failed})"

TELEGRAM_TARGET="${TELEGRAM_TARGET}" "${SCRIPT_DIR}/send-telegram.sh" "${message}"

#!/usr/bin/env bash
set -euo pipefail

# Backward-compatible wrapper around the new tiered monitor.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec /bin/bash "${SCRIPT_DIR}/monitor-alerts.sh" "$@"

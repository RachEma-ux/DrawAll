#!/usr/bin/env bash
# Launch Claude Code against the experimental FreeLLMAPI profile, in a subshell only.
# Direct Claude remains the default outside this script.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVF="${1:-$HERE/freellmapi.env}"
[ -f "$ENVF" ] || { echo "Missing $ENVF (copy freellmapi.env.example and fill it in)"; exit 1; }
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ANTHROPIC_API_KEY is set; Claude Code treats it as a conflicting credential. Unset it first."; exit 1
fi
# shellcheck disable=SC1090
set -a; . "$ENVF"; set +a
: "${ANTHROPIC_BASE_URL:?}"; : "${ANTHROPIC_AUTH_TOKEN:?}"
echo "[freellmapi] Routing Claude Code via $ANTHROPIC_BASE_URL (experimental free providers; NOT Claude quality)."
echo "[freellmapi] Check X-Routed-Via headers / dashboard logs to see the real provider+model."
exec env ANTHROPIC_BASE_URL="$ANTHROPIC_BASE_URL" ANTHROPIC_AUTH_TOKEN="$ANTHROPIC_AUTH_TOKEN" claude "${@:2}"

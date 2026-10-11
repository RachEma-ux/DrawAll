#!/usr/bin/env bash
# DrawAll — Claude Code tool environment health check.
# Prints a PASS/WARN/FAIL line per component. Read-only; no network writes.
set -uo pipefail
PW_CHROMIUM="${PW_CHROMIUM:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
ok(){ printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
warn(){ printf '  \033[33mWARN\033[0m  %s\n' "$*"; }
bad(){ printf '  \033[31mFAIL\033[0m  %s\n' "$*"; }
v(){ command -v "$1" >/dev/null 2>&1; }

echo "== CLIs =="
for c in rtk ccusage bd qmd serena basic-memory graphify strix agent-reach \
         playwright-cli chrome-devtools-mcp playwright-mcp mcp-inspector github-mcp-server context-mode; do
  if v "$c"; then ok "$c -> $(command -v "$c")"; else bad "$c missing"; fi
done

echo "== MCP servers (tools/list via inspector) =="
mcp(){ # name, then server argv
  local name="$1"; shift
  local n; n=$(DANGEROUSLY_OMIT_AUTH=true timeout 120 mcp-inspector --cli "$@" --method tools/list 2>/dev/null \
        | grep -c '"name"')
  [ "${n:-0}" -gt 0 ] && ok "$name: $n tools" || bad "$name: no tools"
}
mcp serena        serena start-mcp-server --context claude-code --project "$PWD" --enable-web-dashboard false
mcp basic-memory  basic-memory mcp
mcp qmd           qmd mcp
mcp context-mode  context-mode
mcp playwright    playwright-mcp --headless --browser chromium --executable-path "$PW_CHROMIUM" --isolated
mcp chrome-devtools chrome-devtools-mcp --headless --isolated --executablePath "$PW_CHROMIUM" --no-usage-statistics --chromeArg=--no-sandbox

echo "== GitHub MCP =="
if [ -n "${GITHUB_TOKEN:-${GH_TOKEN:-}}" ]; then ok "github: harness server active + token present (binary: $(command -v github-mcp-server||echo none))"
else warn "github: no GITHUB_TOKEN/GH_TOKEN in env"; fi

echo "== Blocked-by-environment (expected) =="
curl -s -o /dev/null --max-time 8 https://mcp.context7.com/mcp && ok "context7 backend reachable" || warn "context7: mcp.context7.com blocked by network policy (allowlist to enable)"
curl -s -o /dev/null --max-time 8 https://huggingface.co && ok "huggingface reachable" || warn "huggingface blocked: QMD embeddings/rerank + Basic Memory semantic search unavailable (BM25/text still work)"
docker info >/dev/null 2>&1 && ok "docker daemon up (Strix engine can run)" || warn "no docker daemon: Strix scan engine blocked (CLI+skills installed)"

echo "== Plugins =="
claude plugin list 2>/dev/null | grep -E 'superpowers|claude-code-setup|ecc|claude-mem' -A2 | grep -E '@|Status' || warn "run: claude plugin list"

echo "== Usage (ccusage) =="
ccusage daily --offline --json 2>/dev/null | python3 -c 'import sys,json;d=json.load(sys.stdin);print("  days:",len(d.get("daily",[])),"total tokens:",d.get("totals",{}).get("totalTokens","?"))' 2>/dev/null || warn "ccusage: no data yet"

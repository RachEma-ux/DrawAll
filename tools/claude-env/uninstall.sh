#!/usr/bin/env bash
# DrawAll — roll back the Claude Code tool environment.
# Removes the RTK hook, plugins/marketplaces, status line, and (optionally) the CLIs.
# Does NOT delete your knowledge: Basic Memory notes and Claude-Mem data are left in
# place unless you pass --purge-data. Config backups are under ~/.claude-env-backups
# and ~/.claude/settings.json.bak (made by RTK).
set -uo pipefail
PURGE_DATA=0 PURGE_TOOLS=0
for a in "$@"; do case "$a" in --purge-data) PURGE_DATA=1;; --purge-tools) PURGE_TOOLS=1;; esac; done
log(){ printf '  [claude-env] %s\n' "$*"; }

log "RTK hook"; rtk init -g --uninstall >/dev/null 2>&1 || true
log "plugins"
for p in superpowers@superpowers-marketplace claude-code-setup@claude-plugins-official ecc@ecc claude-mem@thedotmack; do
  claude plugin uninstall "$p" >/dev/null 2>&1 || true
done
log "status line"
python3 - "$HOME/.claude/settings.json" <<'PY' 2>/dev/null || true
import json,sys
p=sys.argv[1]
try: s=json.load(open(p))
except Exception: sys.exit(0)
s.pop("statusLine",None); json.dump(s,open(p,"w"),indent=2)
PY
log "claude-mem worker"; npx -y claude-mem stop >/dev/null 2>&1 || true

if [ "$PURGE_TOOLS" = 1 ]; then
  log "removing CLIs"
  npm rm -g ccusage chrome-devtools-mcp @playwright/mcp @modelcontextprotocol/inspector \
    @upstash/context7-mcp @playwright/cli context-mode @tobilu/qmd @beads/bd >/dev/null 2>&1 || true
  for t in basic-memory serena-agent graphifyy strix-agent agent-reach; do uv tool uninstall "$t" >/dev/null 2>&1 || true; done
  rm -f "$HOME/.local/bin/rtk" "$HOME/.local/bin/github-mcp-server"
fi
if [ "$PURGE_DATA" = 1 ]; then
  log "PURGING knowledge/data (irreversible)"
  rm -rf "$HOME/.claude-mem" "${BASIC_MEMORY_HOME:-$HOME/knowledge/basic-memory}" \
         "$HOME/.cache/qmd" "$HOME/.config/qmd" "$HOME/.claude/context-mode"
fi
log "To remove project config, delete ./.mcp.json, ./.claude/settings.json, ./.serena/ and the docs/tools dirs."

#!/usr/bin/env bash
# DrawAll — Claude Code tool environment installer (idempotent).
# Re-running must NOT duplicate hooks, plugins, MCP servers, or config entries.
# It installs/updates pinned CLIs, registers plugins/marketplaces, wires the RTK
# hook + ccusage status line, and leaves heavy/overlapping components in disabled
# activation profiles (see tools/claude-env/profiles/). Project MCP servers live in
# the committed ./.mcp.json, so this script does not re-add them.
#
# Usage:  bash tools/claude-env/install.sh [--skip-tools]
# Safe to run repeatedly. Secrets are never written or printed.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PW_CHROMIUM_DEFAULT="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
log(){ printf '  [claude-env] %s\n' "$*"; }
have(){ command -v "$1" >/dev/null 2>&1; }

# Pinned versions — keep in sync with docs/claude-env/MANIFEST.md
CCUSAGE=20.0.29 CHROME_DEVTOOLS=1.10.1 PW_MCP=0.0.83 INSPECTOR=2.10.1
CTX7=4.3.0 PW_CLI=0.1.22 CTXMODE=1.0.169 QMD=2.8.3 BEADS=1.3.1 CLAUDE_MEM=13.35.0
BASIC_MEMORY=0.23.2 SERENA=1.7.0 GRAPHIFY=0.9.85 STRIX=1.7.0 RTK=v0.51.0 GH_MCP=v2.0.2

if [ "${1:-}" != "--skip-tools" ]; then
  log "npm global CLIs (pinned)"
  npm i -g --no-fund --no-audit \
    "ccusage@$CCUSAGE" "chrome-devtools-mcp@$CHROME_DEVTOOLS" "@playwright/mcp@$PW_MCP" \
    "@modelcontextprotocol/inspector@$INSPECTOR" "@upstash/context7-mcp@$CTX7" \
    "@playwright/cli@$PW_CLI" "context-mode@$CTXMODE" "@tobilu/qmd@$QMD" "@beads/bd@$BEADS" >/dev/null
  # context-mode's npm postinstall self-registers a dangling plugin key; we use it as MCP only.
  python3 - "$HOME/.claude/settings.json" <<'PY' 2>/dev/null || true
import json,sys,os
p=sys.argv[1]
try: s=json.load(open(p))
except Exception: s={}
ep=s.get("enabledPlugins",{})
if ep.pop("context-mode@context-mode",None) is not None:
    s["enabledPlugins"]=ep; json.dump(s,open(p,"w"),indent=2)
PY

  log "uv tools (pinned)"
  uv tool install -q "basic-memory==$BASIC_MEMORY" --prerelease=allow >/dev/null
  uv tool install -q "serena-agent==$SERENA" >/dev/null
  uv tool install -q "graphifyy[mcp]==$GRAPHIFY" >/dev/null
  uv tool install -q "strix-agent==$STRIX" >/dev/null
  uv tool install -q "agent-reach @ git+https://github.com/Panniantong/Agent-Reach@v1.5.0" >/dev/null

  log "RTK $RTK"
  curl -fsSL "https://raw.githubusercontent.com/rtk-ai/rtk/refs/tags/$RTK/install.sh" \
    | RTK_VERSION="$RTK" RTK_INSTALL_DIR="$HOME/.local/bin" sh >/dev/null

  log "GitHub MCP server $GH_MCP (binary; harness already provides an active 'github' server)"
  if ! have github-mcp-server; then
    t=$(mktemp -d); ( cd "$t"
      curl -fsSL -o g.tgz "https://github.com/github/github-mcp-server/releases/download/$GH_MCP/github-mcp-server_Linux_x86_64.tar.gz"
      tar xzf g.tgz && install -m755 github-mcp-server "$HOME/.local/bin/" ); rm -rf "$t"
  fi
fi

# --- Plugins & marketplaces (idempotent: enable/disable are no-ops if already set) ---
log "plugin marketplaces"
claude plugin marketplace add obra/superpowers-marketplace   >/dev/null 2>&1 || true
claude plugin marketplace add affaan-m/ECC                   >/dev/null 2>&1 || true
claude plugin marketplace add anthropics/claude-plugins-official >/dev/null 2>&1 || true

log "plugins (Superpowers + claude-code-setup active; ECC & claude-mem are opt-in profiles)"
claude plugin install superpowers@superpowers-marketplace        >/dev/null 2>&1 || true
claude plugin install claude-code-setup@claude-plugins-official   >/dev/null 2>&1 || true
claude plugin install ecc@ecc                                     >/dev/null 2>&1 || true
claude plugin disable ecc@ecc                                     >/dev/null 2>&1 || true
# claude-mem: installed on demand via profiles/claude-mem.md (heavy; summarises with your plan tokens)

# --- RTK Claude hook + raw-output config (makes a .bak; @RTK.md added once) ---
log "RTK hook"
if ! grep -q 'rtk hook claude' "$HOME/.claude/settings.json" 2>/dev/null; then
  rtk init -g --auto-patch >/dev/null 2>&1 || true
fi
mkdir -p "$HOME/.config/rtk"
cat > "$HOME/.config/rtk/config.toml" <<'EOF'
[hooks]
exclude_commands = ["curl", "wget", "playwright", "playwright-cli", "docker", "gh"]
[retriever]
mode = "sqlite"
EOF

# --- ccusage status line (user scope) ---
log "ccusage status line"
python3 - "$HOME/.claude/settings.json" <<'PY'
import json,sys
p=sys.argv[1]
try: s=json.load(open(p))
except Exception: s={}
s["statusLine"]={"type":"command","command":"ccusage statusline --offline","padding":0}
json.dump(s,open(p,"w"),indent=2)
PY

# --- Serena project config (languages) if missing ---
if [ ! -f "$REPO/.serena/project.yml" ]; then
  log "serena project config"
  ( cd "$REPO" && printf 'N\nN\nN\nN\n' | serena project create --language typescript --language python . >/dev/null 2>&1 || true )
fi

# --- Basic Memory defaults (text search; HuggingFace embeddings are network-blocked here) ---
basic-memory config set default_search_type text >/dev/null 2>&1 || true

# --- Playwright CLI skills ---
have playwright-cli && playwright-cli install --skills >/dev/null 2>&1 || true

log "done. Health check: bash tools/claude-env/health-check.sh"
log "PW_CHROMIUM defaults to $PW_CHROMIUM_DEFAULT (override via env for the browser MCPs)."

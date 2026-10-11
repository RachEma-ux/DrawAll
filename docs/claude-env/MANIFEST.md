# Claude Code tool environment — component manifest

Installed 2026-10-11 on the DrawAll cloud container (Ubuntu 24.04, x86_64, Claude Code
2.1.296, Node 22.22, bun 1.4.2, uv 0.11.32, Python 3.13, Chromium 141 @ `/opt/pw-browsers`;
**no Docker daemon**). Versions below are the exact ones installed and pinned in
`tools/claude-env/install.sh`.

| # | Component | Version | Source | Integration | Install location |
|---|-----------|---------|--------|-------------|------------------|
| 1 | RTK | 0.51.0 | github rtk-ai/rtk (Apache-2.0) | PreToolUse(Bash) hook | `~/.local/bin/rtk`, `~/.claude/settings.json`, `~/.config/rtk/config.toml` |
| 2 | ccusage | 20.0.29 | npm `ccusage` (MIT) | CLI + status line | `-g`, `~/.claude/settings.json statusLine` |
| 3 | Context Mode | 1.0.169 | npm `context-mode` (Elastic-2.0) | MCP (stdio) | `-g`, `./.mcp.json` |
| 4 | Serena | 1.7.0 | pypi `serena-agent` (GPL-3.0) | MCP (stdio) | `uv tool`, `./.mcp.json`, `./.serena/project.yml` |
| 5 | Context7 | 4.3.0 | npm `@upstash/context7-mcp` (MIT) | MCP (http) — **blocked** | `-g`, `./.mcp.json` (disabled) |
| 6 | Basic Memory | 0.23.2 | pypi `basic-memory` (AGPL-3.0) | MCP (stdio) | `uv tool`, `./.mcp.json` |
| 7 | Claude-Mem | 13.35.0 | npm `claude-mem` (Apache-2.0) | plugin (hooks+MCP) — **opt-in** | `~/.claude/plugins`, profile |
| 8 | QMD | 2.8.3 | npm `@tobilu/qmd` (MIT) | MCP (stdio) + plugin | `-g`, `./.mcp.json` |
| 9 | Beads | 1.3.1 | npm `@beads/bd` (MIT) | CLI (+opt MCP/hooks) | `-g` `bd` |
| 10 | Anthropic Skills | marketplace | github anthropics/skills | plugin skills (incl. **skill-creator**) | synced `anthropic-agent-skills` marketplace |
| 11 | Superpowers | 7.0.0 | github obra/superpowers-marketplace (MIT) | plugin (15 skills + SessionStart) | `~/.claude/plugins` (**active**) |
| 12 | ECC | 2.2.3 | github affaan-m/ECC (`ecc@ecc`) | plugin — **opt-in** | `~/.claude/plugins`, profile |
| 13 | Claude Code Setup | 1.0.0 | github anthropics/claude-plugins-official | plugin skill (read-only) | `~/.claude/plugins` (**active**) |
| 14 | Graphify | 0.9.85 | pypi `graphifyy[mcp]` (Apache-2.0) | skill + hook + `graphify-mcp` | `uv tool`, `~/.claude/skills/graphify` |
| 15 | GitHub MCP Server | 2.0.2 | github release binary (MIT) | MCP (stdio); **harness already runs one** | `~/.local/bin/github-mcp-server` |
| 16 | Playwright CLI | 0.1.22 | npm `@playwright/cli` (Apache-2.0) | CLI + skills | `-g`, `~/.claude/skills/playwright-cli` |
| 17 | Chrome DevTools MCP | 1.10.1 | npm `chrome-devtools-mcp` (Apache-2.0) | MCP (stdio) | `-g`, `./.mcp.json` |
| 18 | MCP Inspector | 2.10.1 | npm `@modelcontextprotocol/inspector` (MIT) | on-demand CLI/UI diagnostic | `-g` `mcp-inspector` |
| 19 | Strix | 1.7.0 | pypi `strix-agent` (FSL/other) | CLI + skills; **engine needs Docker** | `uv tool`, `~/.claude/skills` |
| 20 | Agent Reach | 1.5.0 | github Panniantong/Agent-Reach (MIT) | skill + upstream CLIs | `uv tool`, `~/.claude/skills/agent-reach` |
| 21 | Playwright MCP | 0.0.83 | npm `@playwright/mcp` (Apache-2.0) | MCP (stdio) | `-g`, `./.mcp.json` |
| 22 | FreeLLMAPI | 0.13.7 | github tashfeenahmed/freellmapi (MIT) | separate profile — **opt-in/blocked** | `tools/claude-env/freellmapi/` |

Pinned toolchain note: `@playwright/cli` latest is **0.1.22** (the brief's "0.180.0" and
MCP-Inspector "v2-alpha" were corrected against npm). Chromium is **141** at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (`PW_CHROMIUM`).

## Config files written (committed to the repo)
- `./.mcp.json` — 6 project MCP servers (context7 present but disabled).
- `./.claude/settings.json` — `enableAllProjectMcpServers`, `disabledMcpjsonServers:[context7]`.
- `./.serena/project.yml` — languages (typescript, python).
- `./.claude/skills/root-cause/` — reusable debugging workflow.
- `./tools/claude-env/` — installer, health check, uninstall, profiles, FreeLLMAPI.
- `./docs/claude-env/` — this manifest + setup, responsibilities, completion report, cases.

## User-scope state (not committed; reproduce with `install.sh`)
- `~/.claude/settings.json` — plugins, RTK hook, ccusage status line.
- `~/.claude/plugins` — superpowers, claude-code-setup (active); ecc, claude-mem (disabled).
- `~/.local/bin`, `~/.config/rtk`, `~/.claude/skills/{graphify,agent-reach,strix…}`.
- Knowledge/data (gitignored): `~/knowledge/basic-memory`, `~/.claude-mem`, `~/.cache/qmd`.

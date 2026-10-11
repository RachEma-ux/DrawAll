# DrawAll — Claude Code tool environment: setup & operations

A reproducible tool environment for the DrawAll repo (which contains the **Parcours**
end-to-end proof path and the **Atelier** 2D workshop module). It adds code intelligence,
persistent knowledge, task tracking, browser testing/diagnostics, output filtering, usage
measurement, and structured debugging — all through supported Claude Code integrations.

> Full inventory & versions: `MANIFEST.md`. Who-owns-what: `RESPONSIBILITIES.md`.
> Per-component status & evidence: `COMPLETION-REPORT.md`. Debugging: `../.claude/skills/root-cause`.

## Install / re-install (idempotent)
```bash
bash tools/claude-env/install.sh           # installs pinned CLIs, plugins, hooks, status line
bash tools/claude-env/health-check.sh      # PASS/WARN/FAIL per component
```
Re-running never duplicates hooks, plugins, MCP servers, or config entries. Project MCP
servers come from the committed `./.mcp.json` and load automatically in cloud sessions
(`enableAllProjectMcpServers` is set); in a local terminal, approve them once with `/mcp`.
Config is backed up to `~/.claude-env-backups/` and `~/.claude/settings.json.bak`.

## Start the normal environment
Just run `claude` in the repo. Active by default: the 6 project MCP servers (Serena,
Basic Memory, Playwright, Chrome DevTools, QMD, Context Mode — Context7 is disabled),
Superpowers, claude-code-setup, the RTK Bash-output filter, and the ccusage status line.
The GitHub MCP is provided by the harness (`mcp__github__*`).

## Switch to the FreeLLMAPI profile (experimental, separate)
```bash
cp tools/claude-env/freellmapi/freellmapi.env.example tools/claude-env/freellmapi/freellmapi.env
# edit it: set ANTHROPIC_AUTH_TOKEN to your unified key, ANTHROPIC_BASE_URL to the router root
bash tools/claude-env/freellmapi/launch-freellmapi.sh
```
This sets `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` in a subshell only — your direct
Claude config is untouched. FreeLLMAPI routes to third-party **free tiers** (not Claude
quality, not extra Claude tokens) and must be configured to never fall back to paid
providers. See `tools/claude-env/freellmapi/README.md`. (Live routing is **blocked** in
this container: no Docker, no provider keys, some provider hosts denied.)

## Check health & usage
```bash
bash tools/claude-env/health-check.sh      # component health
ccusage daily        # per-day tokens/cost      ccusage blocks   # 5-hour billing windows
ccusage session      # per-session              # (status line shows live cost continuously)
```

## Access memory / knowledge
- **Curated (Basic Memory):** ask Claude to `search_notes` / `read_note` / `write_note`, or
  `basic-memory` CLI. Store: `~/knowledge/basic-memory` (`BASIC_MEMORY_HOME`). Text search
  is the default (semantic needs a HuggingFace model, blocked here).
- **Docs retrieval (QMD):** `qmd collection add <dir> --name X`; `qmd search "<term>"`.
- **Tasks (Beads):** `bd create "…" -p 1`; `bd ready`; `bd close <id> --reason "…"`.
- **Session history (Claude-Mem):** opt-in — see `tools/claude-env/profiles/claude-mem.md`.

## Raw command output (bypass RTK)
`RTK_DISABLED=1 <cmd>`, or `rtk run <cmd>`, or recover a trimmed result with
`rtk recall <hash> --full`.

## Opt-in profiles
- ECC: `tools/claude-env/profiles/ecc.md`
- Claude-Mem: `tools/claude-env/profiles/claude-mem.md`

## Rollback
```bash
bash tools/claude-env/uninstall.sh                 # remove hooks/plugins/status line (keeps data)
bash tools/claude-env/uninstall.sh --purge-tools   # also remove the CLIs
bash tools/claude-env/uninstall.sh --purge-data    # also delete memory/index DBs (irreversible)
```

## Backup & deletion of persistent memory
- Basic Memory notes are plain Markdown under `~/knowledge/basic-memory` — back up by
  copying that directory; delete by removing it.
- Claude-Mem data (SQLite + Chroma) lives in `~/.claude-mem`; QMD index in `~/.cache/qmd`.
- None of these, nor browser profiles, generated indexes, or `*.env`, are committed
  (see `.gitignore`).

## Known environment blockers (not defects)
Context7 (needs `context7.com`), QMD embeddings/rerank + Basic Memory semantic search
(need `huggingface.co`), the Strix scan engine (needs a Docker daemon), and FreeLLMAPI live
routing are blocked by this container's network policy / missing Docker. Each component's
non-blocked features work; see `COMPLETION-REPORT.md` for exact status and remaining steps.

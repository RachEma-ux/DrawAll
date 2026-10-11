# Completion report — Claude Code tool environment (DrawAll)

Date: 2026-10-11 · Host: cloud container, Ubuntu 24.04 x86_64, Claude Code 2.1.296, Node
22.22, bun 1.4.2, uv 0.11.32, Python 3.13, Chromium 141, **no Docker daemon**. Network
policy denies `context7.com`, `mcp.context7.com`, `api.githubcopilot.com`, `openrouter.ai`,
`huggingface.co` (403 CONNECT). "Verified" below means a real tool call succeeded, not that
a file exists.

Legend: ✅ verified working · ⚙️ configured, opt-in (disabled by default) · ⛔ blocked by
environment · 🟡 configured, partially verified.

---

## 1. RTK — ✅
- **Version/source:** 0.51.0, github rtk-ai/rtk (Apache-2.0).
- **Integration/location:** PreToolUse(Bash) hook `rtk hook claude` in `~/.claude/settings.json`; `~/.config/rtk/config.toml` excludes curl/wget/playwright/docker/gh.
- **Activation:** active (session-wide Bash output filtering).
- **Verification/evidence:** `rtk gain` → ~44.8% output-token reduction across 22 sampled commands. Raw output recoverable via `rtk recall <hash> --full` / `RTK_DISABLED=1`.
- **Remaining action:** none. **Rollback:** `rtk init -g --uninstall`.

## 2. ccusage — ✅
- **Version/source:** 20.0.29, npm `ccusage` (MIT).
- **Integration/location:** CLI (global) + status line `ccusage statusline --offline` in `~/.claude/settings.json`.
- **Activation:** active.
- **Verification/evidence:** `ccusage daily --offline --json` → 1 day, 20,319,003 tokens. `--offline` used because LiteLLM/models.dev pricing feeds need network.
- **Remaining action:** none. **Rollback:** remove `statusLine`; `npm rm -g ccusage`.

## 3. Context Mode — ✅
- **Version/source:** 1.0.169, npm `context-mode` (Elastic-2.0).
- **Integration/location:** MCP stdio server `context-mode` in `./.mcp.json`. **Hooks intentionally not installed** (would collide with RTK on Bash) — used as MCP tools only.
- **Activation:** active (MCP).
- **Verification/evidence:** `tools/list` → 11 tools (`ctx_search`, `ctx_execute`, `ctx_index`, …); `ctx_doctor` → runtimes 9/11, Bun FAST. The stray `enabledPlugins` key its postinstall writes is removed by the installer.
- **Remaining action:** none. **Rollback:** remove from `.mcp.json`; `npm rm -g context-mode`.

## 4. Serena — ✅
- **Version/source:** 1.7.0, pypi `serena-agent` (GPL-3.0).
- **Integration/location:** MCP stdio `serena start-mcp-server --context claude-code` in `./.mcp.json`; languages in `./.serena/project.yml` (typescript, python).
- **Activation:** active (MCP). Dashboard disabled.
- **Verification/evidence:** persistent session: `activate_project` → "typescript, python" servers; `get_symbols_overview src/lib/offset.ts` → full symbol map; `find_symbol offsetPolyline` → `src/lib/offset.ts:45-64` via live TS language server.
- **Remaining action:** none. **Rollback:** remove from `.mcp.json`; `uv tool uninstall serena-agent`.

## 5. Context7 — ⛔
- **Version/source:** 4.3.0, npm `@upstash/context7-mcp` (MIT).
- **Integration/location:** MCP http in `./.mcp.json`; listed in `disabledMcpjsonServers` (project settings) so it doesn't retry a blocked host.
- **Activation:** disabled until its backend is reachable.
- **Verification/evidence:** **blocked** — `mcp.context7.com` returns 403 CONNECT (network policy). Client package installed; no tool call possible.
- **Remaining action (user):** allowlist `context7.com` + `mcp.context7.com` in the environment's Network settings; set `CONTEXT7_API_KEY`; remove `"context7"` from `disabledMcpjsonServers`. **Rollback:** remove the `.mcp.json` entry.

## 6. Basic Memory — ✅
- **Version/source:** 0.23.2, pypi `basic-memory` (AGPL-3.0), installed `--prerelease=allow` (FastMCP 4 pre-release dep).
- **Integration/location:** MCP stdio `basic-memory mcp` in `./.mcp.json`; store `~/knowledge/basic-memory` (`BASIC_MEMORY_HOME`); `default_search_type=text`.
- **Activation:** active (MCP, no hooks — the curated-knowledge owner).
- **Verification/evidence:** `write_note` created `tests/claude-env-smoke-test`; `read_note` returned it; `search_notes` (text) found it. Two curated decision notes seeded.
- **Remaining action:** semantic search needs the HuggingFace embedding model (blocked) — text search is the default and works. **Rollback:** remove from `.mcp.json`; `uv tool uninstall basic-memory`.

## 7. Claude-Mem — ⚙️ (infra verified)
- **Version/source:** 13.35.0, npm `claude-mem` (Apache-2.0), plugin `claude-mem@thedotmack`.
- **Integration/location:** plugin (SessionStart/PostToolUse/Stop hooks + `mcp-search` MCP); data `~/.claude-mem`.
- **Activation:** **disabled by default** (opt-in) — it summarises with plan tokens and its worker/DB don't persist in an ephemeral container. See `tools/claude-env/profiles/claude-mem.md`.
- **Verification/evidence:** `claude-mem doctor` all required checks pass; worker starts healthy (`/api/health` → `{"status":"ok","mcpReady":true,"ai":{"provider":"claude"}}`). Passive capture not left running by design.
- **Remaining action (user):** to use, `claude plugin enable claude-mem@thedotmack && npx claude-mem start` and apply the cost-control env in the profile. **Rollback:** `claude plugin uninstall claude-mem@thedotmack`.

## 8. QMD — 🟡
- **Version/source:** 2.8.3, npm `@tobilu/qmd` (MIT).
- **Integration/location:** MCP stdio `qmd mcp` in `./.mcp.json` (also available as a plugin).
- **Activation:** active (MCP). BM25 only here.
- **Verification/evidence:** `qmd collection add ./docs` indexed 14 docs; `qmd search "coupe"` returned a matching doc. MCP `tools/list` → query/get/multi_get/status.
- **Remaining action:** semantic `vsearch`/`query` need GGUF models from `huggingface.co` (blocked, ~2 GB). BM25 `search` works without them. **Rollback:** remove from `.mcp.json`; `npm rm -g @tobilu/qmd`.

## 9. Beads — ✅
- **Version/source:** 1.3.1, npm `@beads/bd` (MIT). (v1.3.2-rc.2 is a prerelease; 1.3.1 is stable.)
- **Integration/location:** CLI `bd` (embedded Dolt, no server). Optional MCP (`beads-mcp`) and SessionStart `bd prime` hook are **not** auto-wired (keeps context lean).
- **Activation:** active (CLI).
- **Verification/evidence:** isolated `BEADS_DIR`: `bd create` → `DrawAll-jgr`; appeared in `bd ready`; `bd close --reason` → closed; `bd ready` then empty.
- **Remaining action (optional):** `bd setup claude` to inject task context each session; `uv tool install beads-mcp` for the MCP. **Rollback:** `npm rm -g @beads/bd`; delete `.beads/`.

## 10. Anthropic Skills (incl. skill-creator) — ✅
- **Version/source:** github anthropics/skills (marketplace `anthropic-agent-skills`).
- **Integration/location:** already present via the account's **synced** marketplace (`~/.claude/skills/synced/...`).
- **Activation:** active (discoverable skills).
- **Verification/evidence:** `skill-creator`, `docx`, `xlsx`, `pptx`, `pdf`, `deep-research`, etc. appear in this session's skill list (`anthropic-skills:*`). Not re-installed, to avoid duplicating the synced marketplace.
- **Remaining action:** none. **Rollback:** managed by the account's synced marketplace.

## 11. Superpowers — ✅
- **Version/source:** 7.0.0, github obra/superpowers-marketplace (MIT).
- **Integration/location:** plugin `superpowers@superpowers-marketplace`; SessionStart hook injects the skill index.
- **Activation:** active — the primary dev/debug workflow.
- **Verification/evidence:** `claude plugin list` → enabled; 15 skills on disk (brainstorming, systematic-debugging, test-driven-development, verification-before-completion, writing-plans, …).
- **Remaining action:** none. **Rollback:** `claude plugin uninstall superpowers@superpowers-marketplace`.

## 12. ECC — ⚙️
- **Version/source:** 2.2.3, github affaan-m/ECC (`ecc@ecc`).
- **Integration/location:** plugin; 71 agents / 306 skills / 97 commands / 27 hooks.
- **Activation:** **disabled by default** — overlaps Superpowers heavily and its hooks add cost. See `tools/claude-env/profiles/ecc.md`.
- **Verification/evidence:** `claude plugin list` → installed, status disabled.
- **Remaining action (user):** `claude plugin enable ecc@ecc` with `ECC_HOOK_PROFILE=minimal`, `ECC_SESSION_START_CONTEXT=off`, `ECC_GATEGUARD=off` (per profile) if you prefer ECC over Superpowers. **Rollback:** `claude plugin uninstall ecc@ecc`.

## 13. Claude Code Setup — ✅
- **Version/source:** 1.0.0, github anthropics/claude-plugins-official.
- **Integration/location:** plugin skill `claude-automation-recommender` (read-only).
- **Activation:** active.
- **Verification/evidence:** its read-only assessment was run early (Phase 1): detected React + Hono + tRPC + Drizzle(mysql2) + three.js + yjs + vitest + Playwright, 234 TS files, Python exporter scripts, CI workflows — those findings shaped this setup (Playwright/Chrome MCP, Serena TS+PY, GitHub MCP, context7 recommendation).
- **Remaining action:** none. **Rollback:** `claude plugin uninstall claude-code-setup@claude-plugins-official`.

## 14. Graphify — ✅
- **Version/source:** 0.9.85 (pypi `graphifyy[mcp]`, Apache-2.0). (No 1.0.0 published.)
- **Integration/location:** `/graphify` skill (`~/.claude/skills/graphify`) + CLAUDE.md note + optional `graphify-mcp`.
- **Activation:** active (skill). Output dirs gitignored.
- **Verification/evidence:** `graphify update src/lib` (deterministic tree-sitter, **no LLM**) → 1616 nodes / 4650 edges from 160 files; `graphify explain "offsetPolyline"` → `offsetObject --calls--> offsetPolyline --calls--> shifted/lineIntersection`. Deterministic indexing confirmed; doc/label passes would need a model backend (`GEMINI_API_KEY`, etc.).
- **Remaining action (optional):** `uv tool install "graphifyy[mcp]"` already done; add `graphify-mcp` to `.mcp.json` if you want graph queries as MCP. **Rollback:** `graphify uninstall`; `uv tool uninstall graphifyy`.

## 15. GitHub MCP Server — ✅
- **Version/source:** 2.0.2 release binary (MIT) at `~/.local/bin/github-mcp-server`.
- **Integration/location:** the **harness already provides an active `github` MCP server** (`mcp__github__*`); the official binary is installed as a portable/local fallback and is **not** registered a second time (that would duplicate the toolset and waste context).
- **Activation:** active via harness; binary ready for `claude mcp add-json github '{"command":"github-mcp-server","args":["stdio"],"env":{"GITHUB_PERSONAL_ACCESS_TOKEN":"…"}}'` elsewhere.
- **Verification/evidence:** real calls succeeded this session — `get_file_contents` (DrawAll tree) and `search_code`. `GITHUB_TOKEN`/`GH_TOKEN` present.
- **Remaining action:** none here. The remote `api.githubcopilot.com` transport is network-blocked (not needed; local server works). **Rollback:** `rm ~/.local/bin/github-mcp-server`.

## 16. Playwright CLI — ✅
- **Version/source:** 0.1.22, npm `@playwright/cli` (Apache-2.0). (Not "0.180.0" — that version does not exist.)
- **Integration/location:** CLI `playwright-cli` + skill at `./.claude/skills/playwright-cli` (`playwright-cli install --skills`); it added `.playwright-cli/` to `.gitignore`.
- **Activation:** active (skill).
- **Verification/evidence:** `playwright-cli --version` → 0.1.22; `DEPENDENCIES_VALIDATED / INSTALLATION_COMPLETE`; skill files installed. Headless by default; point at Chromium 141 via `executablePath`/`PLAYWRIGHT_MCP_EXECUTABLE_PATH` if the bundled revision differs.
- **Remaining action:** none. **Rollback:** `npm rm -g @playwright/cli`; delete the skill dir.

## 17. Chrome DevTools MCP — ✅
- **Version/source:** 1.10.1, npm `chrome-devtools-mcp` (Apache-2.0).
- **Integration/location:** MCP stdio in `./.mcp.json` with `--headless --isolated --executablePath $PW_CHROMIUM --no-usage-statistics` (add `--chromeArg=--no-sandbox` in this container).
- **Activation:** active (MCP).
- **Verification/evidence:** against the local fixture — `new_page` → page list; `list_console_messages` (pageId) → captured `DRAWALL_TEST_CONSOLE_ERROR` + 404; `list_network_requests` → `/ [200]`, `/does-not-exist-404 [404]`, `/favicon.ico [404]`. 30 tools total. (Chromium is officially "unsupported" vs Chrome stable but works here.)
- **Remaining action:** none. **Rollback:** remove from `.mcp.json`; `npm rm -g chrome-devtools-mcp`.

## 18. MCP Inspector — ✅
- **Version/source:** 2.10.1, npm `@modelcontextprotocol/inspector` (MIT). (Stable v2, not v2-alpha.)
- **Integration/location:** on-demand CLI `mcp-inspector --cli` (and web UI). `DANGEROUSLY_OMIT_AUTH=true` for local CLI smoke tests.
- **Activation:** on-demand diagnostic.
- **Verification/evidence:** used throughout this setup to `tools/list` and `tools/call` every MCP server (Serena, Basic Memory, QMD, Context Mode, Playwright, Chrome DevTools).
- **Remaining action:** none. **Rollback:** `npm rm -g @modelcontextprotocol/inspector`.

## 19. Strix — ⛔ (CLI + skills installed; engine blocked)
- **Version/source:** 1.7.0, pypi `strix-agent`.
- **Integration/location:** CLI `strix`; SKILL.md integrations `penetration-testing-with-strix`, `find-security-vulnerabilities-in-code` in `~/.claude/skills`.
- **Activation:** skills active; scan engine not runnable here.
- **Verification/evidence:** `strix --version` → 1.7.0, CLI help OK. **Engine blocked:** the local engine requires a running Docker daemon (sandbox image `ghcr.io/usestrix/strix-sandbox`) — none in this container — plus an `LLM_API_KEY`. Validation against a local fixture was therefore not possible.
- **Remaining action (user):** run on a host with Docker; `export STRIX_LLM=… LLM_API_KEY=…`; then `strix -n --target ./<fixture>` (authorized targets only). Or use the managed `strix cloud` (no Docker) with `strix cloud login`. **Rollback:** `uv tool uninstall strix-agent`; delete the skill dirs.

## 20. Agent Reach — ✅ (adapters enumerated)
- **Version/source:** 1.5.0, installed from github Panniantong/Agent-Reach (MIT). (The PyPI `agent-reach` name is a different project — not used.)
- **Integration/location:** skill `~/.claude/skills/agent-reach` + upstream CLIs.
- **Activation:** active (skill).
- **Verification/evidence:** `agent-reach doctor` → 2/13 channels ready now: **RSS ✅**, **web via Jina Reader ✅** (`r.jina.ai` reachable). Needs setup: GitHub (gh auth), YouTube (yt-dlp), full-web search (mcporter+Exa). Blocked by network: V2EX (403). 7 login-gated channels available on request.
- **Remaining action (user):** `gh auth login`, `pip install yt-dlp`, `npm i -g mcporter` as desired; cookie/login for social channels. **Rollback:** `uv tool uninstall agent-reach`; delete the skill dir.

## 21. Playwright MCP — ✅
- **Version/source:** 0.0.83, npm `@playwright/mcp` (Apache-2.0).
- **Integration/location:** MCP stdio in `./.mcp.json`: `--headless --browser chromium --executable-path $PW_CHROMIUM --isolated`.
- **Activation:** active (MCP).
- **Verification/evidence:** against the local fixture — `browser_navigate` launched Chromium 141 headless; `browser_console_messages` → "3 errors" incl. `DRAWALL_TEST_CONSOLE_ERROR` + the 404. 25 tools.
- **CLI vs MCP rule:** default to the Playwright **CLI+skills** for scripted work (token-efficient); use **MCP** for stateful/exploratory loops; use **Chrome DevTools MCP** for diagnostics. (See RESPONSIBILITIES.md.)
- **Remaining action:** none. **Rollback:** remove from `.mcp.json`; `npm rm -g @playwright/mcp`.

## 22. FreeLLMAPI — ⛔ (profile delivered; live routing blocked)
- **Version/source:** 0.13.7, github tashfeenahmed/freellmapi (MIT).
- **Integration/location:** a **separate** profile in `tools/claude-env/freellmapi/` (`launch-freellmapi.sh`, `freellmapi.env.example`, README). Speaks the Anthropic Messages API at the router root; uses `ANTHROPIC_AUTH_TOKEN` (never `ANTHROPIC_API_KEY`).
- **Activation:** opt-in, in a subshell only — **direct Claude remains the default**.
- **Verification/evidence:** config + launcher authored and validated for correctness; **not run live** — no Docker (one-line installer), no provider keys, and some provider hosts (e.g. `openrouter.ai`) are network-blocked. It is **not** extra Claude tokens and is not Claude-quality; it must be configured with a free-only fallback chain (no silent paid fallback) and identified via `X-Routed-Via` headers.
- **Remaining action (user):** Node source-install the router with provider keys, build a free-only chain, then `launch-freellmapi.sh`. **Rollback:** delete the `freellmapi/` dir and never set the env.

---

## Mandatory MCP servers — checklist

| MCP server | Scope / location | Connection | Tool discovery | Meaningful call | Status |
|------------|------------------|------------|----------------|-----------------|--------|
| **Context7** | project `.mcp.json` (http) | ⛔ `mcp.context7.com` 403 | — | — | ⛔ blocked (allowlist host + API key) |
| **Serena** | project `.mcp.json` (stdio) | ✅ | 29 tools | `find_symbol offsetPolyline` → offset.ts:45-64 | ✅ |
| **Basic Memory** | project `.mcp.json` (stdio) | ✅ | 21 tools | write_note → read_note → search_notes | ✅ |
| **GitHub MCP** | harness-provided (+binary) | ✅ | `mcp__github__*` | `get_file_contents`, `search_code` | ✅ |
| **Playwright MCP** | project `.mcp.json` (stdio) | ✅ | 25 tools | navigate + console (caught error+404) | ✅ |
| **Chrome DevTools MCP** | project `.mcp.json` (stdio) | ✅ | 30 tools | console + network on fixture | ✅ |

5/6 verified working; Context7 blocked by network policy (remediation above).

---

## Token effects (honest, measured)

Same model/task held constant; cache state noted. These measure **output reduction**,
reported separately from total session consumption, and **not** claimed as savings from
installation alone.

- **RTK output filtering:** `rtk gain` over 22 sampled commands → input 2.6k, output 1.4k,
  **saved ~1.1k tokens (44.8%)**. Command-specific: `git log --stat -40` saw **0%** (not a
  filtered pattern), while build/test/status output compresses more. Full output remains
  recoverable (`rtk recall --full`), so the reduction is lossless for the model's context.
- **Deferred MCP tool loading** (on by default): the 6 project servers contribute ~145
  tool definitions, but only names + server instructions enter context until a tool is
  used — so they do not pay their full schema cost per turn. Verify live with `/context`.
- **Design choices that avoid spend:** Claude-Mem passive summarisation (plan tokens on
  every Stop) and ECC's 306 skills / 27 hooks are **disabled by default**; only one
  SessionStart injector (Superpowers) and one Bash filter (RTK) are active, so no output is
  compressed twice and no memory is injected twice.
- **Not measured / caveats:** a full before/after of an identical multi-step task across a
  warm vs cold cache was not run; memory summarisation/retrieval overhead applies only when
  Claude-Mem is enabled (off by default). Nested `claude -p` smoke call (haiku) cost
  $0.0029 (24.4k cache-read, 12.5k cache-write) — recorded as the measurement baseline.

Measure anytime: `ccusage daily` / `ccusage blocks`; the status line shows live cost;
`/context` shows what currently fills the window.

---

## How to run (quick reference)

- **Normal environment:** `claude` in the repo (6 MCP servers + Superpowers + claude-code-setup + RTK + ccusage status line; GitHub via harness).
- **FreeLLMAPI profile:** `bash tools/claude-env/freellmapi/launch-freellmapi.sh` (after filling `freellmapi.env`). Subshell only; direct Claude stays default.
- **Health:** `bash tools/claude-env/health-check.sh`.
- **Memory:** Basic Memory `search_notes`/`write_note` (curated); `qmd search` (docs); `bd ready` (tasks).
- **Usage:** `ccusage daily` · `ccusage blocks` · status line.
- **Debugging:** `/root-cause` skill; cases in `docs/claude-env/cases/`.
- **Opt-in:** `tools/claude-env/profiles/{ecc,claude-mem}.md`. **Rollback:** `tools/claude-env/uninstall.sh`.

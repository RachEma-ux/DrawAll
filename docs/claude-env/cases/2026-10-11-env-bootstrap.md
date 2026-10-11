# Case: Claude Code tool environment bootstrap on DrawAll

- **Project:** DrawAll (Parcours/Atelier) + api + exporters
- **Date:** 2026-10-11
- **Version / commit:** `90bd4db` on branch ccr-2a8071db-po9zb2
- **Status:** resolved

## Symptoms & expected behaviour
- Expected: 22 tool components installed and usable through their Claude integration, six mandatory MCP servers verified, token use reduced, knowledge persisted.

## Reproduction steps
1. Fresh cloud container (Ubuntu 24.04, x86_64, Claude Code 2.1.296), DrawAll cloned.

## Evidence (facts, not impressions)
- OS Linux 6.18 x86_64; Node 22.22, bun 1.4.2, uv 0.11.32, Python 3.13, cargo 1.97, Chromium 141 at /opt/pw-browsers; **no docker daemon**.
- Network policy DENIES context7.com, mcp.context7.com, api.githubcopilot.com, openrouter.ai, huggingface.co (403 CONNECT).
- Serena find_symbol resolved `offsetPolyline` -> src/lib/offset.ts:45-64 via live TS language server.
- Basic Memory write_note + text search_notes round-tripped (semantic search needs blocked HF model -> set default_search_type=text).
- Playwright MCP + Chrome DevTools MCP both captured the intentional console error + 404 on a local fixture.
- QMD BM25 search returned docs; Beads create->ready->close lifecycle clean; Graphify built 1616-node/4650-edge AST graph (no LLM) and explained a real call relationship.
- RTK gain: ~44.8% output-token reduction across sampled commands (command-specific; git log --stat saw 0%).

## Hypotheses rejected (and why)
- "Install the PyPI 'agent-reach' package" — rejected: upstream warns that PyPI name is a different project; installed from the GitHub repo per docs.
- "Register a 2nd github MCP from the local binary" — rejected: harness already runs an official 'github' server (verified via real tool calls); a 2nd entry would duplicate the toolset and waste context.

## Confirmed root cause
- N/A (greenfield setup, not a defect). Blockers are environment policy, not code.

## Implemented correction (smallest change)
- Committed ./.mcp.json (6 servers), ./.claude/settings.json (auto-approve), ./.serena/project.yml; user-scope plugins/hooks/status line via tools/claude-env/install.sh.

## Verification results
- [x] six mandatory MCP servers: 5 verified working, Context7 blocked (network).
- [x] npm run check/lint not required (no app code changed).

## Remaining limitations / assumptions
- Context7 (needs context7.com), QMD embeddings/rerank + Basic Memory semantic search (need huggingface.co), and the Strix scan engine (needs Docker) are blocked by this container. FreeLLMAPI live routing not verified (no provider keys + Docker + some hosts blocked).

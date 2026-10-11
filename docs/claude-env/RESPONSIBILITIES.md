# Responsibilities & overlap resolution

Many components overlap. To avoid compressing the same output twice, injecting duplicate
memories, or running two agents for one job, each capability has **one active owner**;
overlapping alternatives are installed in disabled profiles with activation steps.

## Active ownership

| Responsibility | Active owner | Why / notes |
|----------------|--------------|-------------|
| Curated requirements, decisions, validated knowledge | **Basic Memory** (MCP, no hooks) | File-based Markdown; zero inference cost; retrieved on demand. |
| Historical session observations & summaries | **Claude-Mem** — *opt-in* | Summarises with plan tokens; ephemeral worker here. Off by default. |
| Retrieval from selected document collections | **QMD** | BM25 works now; embeddings/rerank need HuggingFace (blocked). |
| Actionable work, dependencies, blockers | **Beads** (`bd`) | CLI + optional MCP; embedded Dolt, no server. |
| Precise symbol navigation & editing | **Serena** | LSP-backed (typescript, python). |
| Broader relationships & architectural impact | **Graphify** | Deterministic tree-sitter AST graph; LLM only for doc/label passes. |
| External library documentation | **Context7** — *blocked* | Needs context7.com (network policy). |
| Terminal-output filtering | **RTK** | PreToolUse(Bash) rewrite; `rtk recall` keeps full output. |
| Large-output handling / selective retrieval | **Context Mode** (MCP tools only) | Its hooks are **not** installed, to avoid a 2nd Bash rewrite colliding with RTK. |
| Measurement | **ccusage** | CLI + status line. |
| Primary dev & debugging workflow | **Superpowers** | 15 skills incl. systematic-debugging, TDD, verification. |
| Complementary capabilities | **ECC** — *opt-in* | Overlaps Superpowers heavily; disabled to avoid duplicate workflows/hooks. |
| Browser automation (act) | **Playwright** (CLI + MCP) | See rule below. |
| Browser diagnostics (inspect) | **Chrome DevTools MCP** | Console/network/performance. |
| Code intelligence / assessment | **claude-code-setup** | Read-only recommender (ran at setup). |
| Skills authoring | **skill-creator** (Anthropic Skills) | Already present via the synced marketplace. |

## Playwright: CLI vs MCP (the choice rule)
- **Default to the Playwright CLI + skills** for scripted, high-throughput browser work:
  it is more token-efficient (no large tool schemas / accessibility trees in context).
- **Use Playwright MCP** for exploratory, stateful agentic loops where persistent browser
  context and rich introspection outweigh token cost (self-healing flows, long sessions).
- **Use Chrome DevTools MCP** specifically for diagnostics: console messages, network
  requests, and performance traces. All three point at the same Chromium 141 via
  `--executable-path/--executablePath $PW_CHROMIUM`; Chrome DevTools also needs
  `--chromeArg=--no-sandbox` in this container.

## Hook ordering & interactions (what runs, and what deliberately does not)
Active hooks are kept minimal and non-overlapping:
- **PreToolUse(Bash)** → RTK only. Context Mode's and ECC's Bash hooks are **not** active,
  so a Bash command is rewritten at most once.
- **SessionStart** → Superpowers only (injects its skill index). Basic Memory is MCP-only
  (no SessionStart hook); Claude-Mem's and ECC's SessionStart injectors stay disabled, so
  context is injected by exactly one owner.
- **Stop / PostToolUse** → none active. Claude-Mem's observation/summarise hooks (plan-token
  cost) and ECC's format/typecheck are opt-in.
- **Beads** SessionStart `bd prime` is **not** auto-wired; enable with `bd setup claude` if
  you want task context injected (adds ~1–2k tokens/session).

## Token-reduction rationale (objective #1)
Deferred MCP tool loading (on by default) means the 6 project servers add only names +
server instructions until a tool is used. The heaviest token sinks — Claude-Mem passive
summarisation, ECC's 306 skills / 27 hooks — are disabled by default. RTK trims verbose
command output; Serena/Graphify replace broad greps + multi-file reads with one symbol or
graph call; Context Mode handles large outputs on demand. See `docs/en/costs` guidance
applied: CLI preferred over MCP where equivalent (e.g. `gh`), CLAUDE.md kept lean, verbose
ops delegable to subagents.

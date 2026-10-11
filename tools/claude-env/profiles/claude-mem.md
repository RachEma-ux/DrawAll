# Profile: Claude-Mem (opt-in, disabled by default)

Claude-Mem (`claude-mem@thedotmack`, v13.35.0) captures session observations and
summarises them with an LLM through the Claude Agent SDK — by default on your Claude plan
(`CLAUDE_MEM_PROVIDER=claude`, model `claude-haiku-4-5`). That means **passive token cost
on every Stop/PostToolUse**, and its SessionStart injection would stack on top of
Superpowers'. In this ephemeral cloud container the Bun worker and Chroma DB do not persist
across sessions, so cross-session value is limited. It is therefore **installed but
disabled** by default; Basic Memory (on-demand MCP, no inference cost) is the active
persistence layer.

Verified here: `claude-mem doctor` passes and the worker starts healthy
(`http://127.0.0.1:37700/api/health` → `{"status":"ok","mcpReady":true}`).

## Activate
```bash
claude plugin enable claude-mem@thedotmack
npx claude-mem start            # start the worker
```
Cost controls (set in `~/.claude-mem/settings.json` or the `env` block of ~/.claude/settings.json):
```
CLAUDE_MEM_SKIP_SUBAGENT_OBSERVATIONS=true
CLAUDE_MEM_OBSERVE_BARE_PROMPTS=false
CLAUDE_MEM_SKIP_TOOLS=ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion
# full kill switches (env only):
# CLAUDE_MEM_DISABLE_OBSERVATION=1  CLAUDE_MEM_DISABLE_FILE_CONTEXT=1
```
Note on duplication: when Claude-Mem is on, it becomes the one passive memory-injection
system. Keep Basic Memory as MCP-only (no hooks) — which is how this setup installs it — so
the two never double-inject. Semantic retrieval needs a vector embedding model; HuggingFace
is network-blocked here, so retrieval falls back accordingly.

## Deactivate
```bash
npx claude-mem stop && claude plugin disable claude-mem@thedotmack
```

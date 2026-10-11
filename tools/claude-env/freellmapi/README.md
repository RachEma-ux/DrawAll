# FreeLLMAPI — experimental provider-routing profile (separate from direct Claude)

This is an **opt-in, experimental** profile that points Claude Code at a self-hosted
[FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) router (v0.13.7) speaking the
Anthropic Messages API. It is **completely separate** from your normal direct-Claude
setup and never changes your default provider.

## What it is NOT
- It is **not** extra Claude subscription tokens. It routes to third-party free tiers
  (Google, Groq, Cerebras, Mistral, OpenRouter, …). Model quality is **not** equivalent
  to Claude, and tool-calling/streaming support varies per provider.
- A free profile must **not** silently fall over to a paid provider. Build your fallback
  chain from free models only (see "No silent paid fallback" below).

## Status in this environment: BLOCKED for live verification
- No Docker daemon here, so the one-line Docker install can't run. Use the Node source
  install instead. The router also needs **provider API keys you supply** and reachability
  to each provider (some hosts, e.g. `openrouter.ai`, are blocked by this container's
  network policy). Live routing was therefore not verified here.

## Run the router (Node source install; needs provider keys)
```bash
git clone https://github.com/tashfeenahmed/freellmapi.git ~/freellmapi
cd ~/freellmapi && npm install
ENCRYPTION_KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
printf "ENCRYPTION_KEY=%s\nPORT=3001\n" "$ENCRYPTION_KEY" > .env   # .env is gitignored
npm run dev            # dashboard + API on http://localhost:3001
```
Add provider keys on the dashboard **Keys** page (AES-256-GCM encrypted at rest). Copy the
unified `freellmapi-…` key it issues.

## Point Claude Code at it (this profile only)
`launch-freellmapi.sh` sets the two env vars **in a subshell** and launches `claude`, so
your global/direct configuration is untouched:
```bash
bash tools/claude-env/freellmapi/launch-freellmapi.sh   # reads freellmapi.env
```
Direct Claude stays the default: just run `claude` normally (no env set).

## No silent paid fallback
On the dashboard **Fallback** page build a named chain containing only free models and make
it active; `plain auto` follows the active chain and refuses (HTTP 400) when it is empty
rather than routing over the whole catalog. Keep paid-credit providers (sail, reka,
opencode paid, bazaarlink direct ids) **out** of the chain.

## Identify the real provider/model
Every response carries `X-Routed-Via: <platform>/<model>` (and `X-Fallback-Attempts` /
`X-Fallback-Trail` on failover). The server log viewer and `GET /api/free-tier` show
per-pool budgets. Use these to confirm which free provider actually served a call.

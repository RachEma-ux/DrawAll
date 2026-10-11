# Profile: ECC (opt-in, disabled by default)

ECC (`ecc@ecc`, v2.2.3) ships 71 agents, 306 skills, 97 commands and 27 hooks — it
overlaps heavily with Superpowers (planning, TDD, debugging, code-review, verification)
and with the memory stack. Running it alongside Superpowers would duplicate workflows,
and its default hooks (gateguard gating the first edit of every file, format/typecheck on
Stop, session-start memory injection) add latency and token cost. So ECC is **installed
but disabled**; Superpowers is the active development/debugging workflow.

## Activate
```bash
claude plugin enable ecc@ecc
# recommended: keep hooks light and non-duplicating
#   ECC_HOOK_PROFILE=minimal         # no hooks-runtime (no gateguard / format-typecheck)
#   ECC_SESSION_START_CONTEXT=off    # don't stack another SessionStart injector
#   ECC_GATEGUARD=off
```
Set those in the `env` block of `~/.claude/settings.json`. Pick ECC **or** Superpowers as
the primary; if you enable both, disable the overlapping ECC hooks above.

## Deactivate
```bash
claude plugin disable ecc@ecc
```
Optional rules packs (not shipped by the plugin): `cp -R /home/user/affaan-m/ECC/rules/{common,typescript} ~/.claude/rules/ecc/`.

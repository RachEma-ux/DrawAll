---
name: root-cause
description: Reusable root-cause analysis and debugging workflow for DrawAll (Parcours/Atelier). Use when investigating a bug, regression, failing test, incorrect export (DXF/PDF/SVG/STEP), or any "why does X happen" defect. Retrieves prior cases and requirements, reproduces, collects evidence, tests hypotheses, finds the true root cause, applies the smallest fix, runs regression checks, and records a validated lesson.
---

# Root-cause analysis (DrawAll)

A disciplined loop that reuses the installed tool environment instead of guessing.
Keep **assumptions** and **confirmed facts** separate at every step. Retrieve only
cases relevant to the current task.

> Tooling map (see `docs/claude-env/RESPONSIBILITIES.md` for the full matrix):
> - **Basic Memory** (MCP `search_notes`/`read_note`/`write_note`) — curated requirements, decisions, validated cases.
> - **Serena** (MCP `find_symbol`/`find_referencing_symbols`/`get_symbols_overview`) — precise code navigation.
> - **Graphify** (`graphify explain "X"` / `graphify path "A" "B"`) — call/impact relationships.
> - **Superpowers** skill `systematic-debugging` — the hypothesis discipline; `verification-before-completion` before you claim done.
> - **Context7** (when reachable) — external library docs.
> - **RTK / Context Mode** — keep command output small; `rtk recall <hash> --full` recovers full output.
> - **ccusage** — measure token cost of the investigation if asked.

## The loop

1. **Retrieve context.** `search_notes` Basic Memory for the symptom, the touched
   module, and prior cases. Read `src/data/requirements.ts` and the relevant
   `docs/DrawAll_v4.1_*` for expected behaviour. Write down the **expected** result
   as a fact, and every unknown as an assumption.
2. **Reproduce.** Find the smallest deterministic reproduction. Prefer an existing
   `e2e/*.spec.ts` or a `src/**/*.test.ts`; if none exists, write a minimal failing
   test. A defect you cannot reproduce is not yet understood — do not "fix" it.
3. **Collect evidence.** Capture the real signal: test output, `get_diagnostics_for_file`
   (Serena), console/network via the Playwright or Chrome DevTools MCP for UI issues,
   exporter check scripts (`scripts/check-*.py`) for DXF/PDF/SVG/STEP. Attach exact
   values, not impressions.
4. **Form hypotheses.** List specific, falsifiable hypotheses ranked by likelihood.
   Use Serena `find_referencing_symbols` and `graphify explain` to see what actually
   reaches the failing code. Invoke the Superpowers `systematic-debugging` skill.
5. **Test each hypothesis** against the evidence. Record which you **reject** and why.
   Stop when one explains every observation.
6. **Confirm the root cause.** State it as one sentence with the evidence that proves
   it. If evidence is missing, go back to step 3 — do not promote an assumption.
7. **Smallest correction.** Fix the cause, not the symptom. Change the least code that
   removes the root cause; do not widen scope or refactor opportunistically.
8. **Regression checks.** Run the reproduction (now passing), then the meaningful
   neighbours: `npm run check`, `npm run lint`, the affected `vitest` file(s), and the
   relevant `e2e` spec. For exporter changes, re-run the matching `scripts/check-*.py`.
9. **Record the lesson.** Write a case with `write_note` into Basic Memory folder
   `cases/` using the template in `docs/claude-env/cases/_template.md`. Note remaining
   limitations honestly.

## Case record — required fields

Project · date · version/commit · symptoms · expected behaviour · reproduction steps ·
evidence · rejected hypotheses · confirmed root cause · implemented correction ·
verification results · remaining limitations.

Keep assumptions labelled as assumptions until evidence makes them facts. A case with
an unconfirmed root cause is logged as **open**, not closed.

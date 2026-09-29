---
name: debugging
description: Root-cause debugging for bugs, crashes, wrong output, flaky behavior and failing checks. Use when something behaves incorrectly and the cause is not yet known.
---

# Debugging

Goal: find the root cause, fix it with the smallest change, prove it with a regression check.

## Loop

1. **Reproduce.** Get a deterministic reproduction (failing test, command, input). No repro → gather evidence (logs, stack trace, versions) before touching code.
2. **Localize.** Search from the symptom: error message, stack frame, symbol. `rg -n "<message>"`, then read the specific range. Do not read whole modules.
3. **Hypothesize.** State one falsifiable hypothesis: "X is null because Y runs before Z."
4. **Test the hypothesis** with the cheapest probe: a targeted assertion, a log line, a narrowed test, `git bisect` for regressions.
5. **Fix the cause, not the symptom.** No catch-all try/except, no retry loops, no special-casing the failing input.
6. **Regression coverage.** Add or update a test that fails before the fix and passes after.
7. **Verify** the repro, the new test and the relevant suite. Remove probes and debug output.

## Rules

- **No blind retries.** Same failure twice on unchanged code → the hypothesis is wrong. Re-read the evidence, form a new hypothesis.
- **Keep a failure log** (mentally or `jagernator task note failure "<hypothesis> → refuted by <evidence>"`) so you don't re-investigate dead ends.
- **Read the actual error.** Full message and first relevant stack frame, not just the last line.
- **Suspect recent changes first:** `git log -p --since=... -- <path>`, `git diff`.
- **Flaky?** Look for ordering, time, shared state, concurrency, network. Reproduce with a loop before claiming a fix.
- **Never "fixed"** without the reproduction passing.

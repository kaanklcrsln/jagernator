---
name: refactoring
description: Behavior-preserving restructuring - extract, rename, move, inline, simplify. Use when the task is to restructure code without changing what it does.
---

# Refactoring

A refactor changes structure, not behavior. Prove that.

## Before

- **Safety net.** Identify tests that cover the code. If none, add characterization tests first (or tell the user coverage is missing).
- **Baseline.** Run them and record the result.
- **Scope.** Refactor only what the task requires. Adjacent "improvements" are separate tasks.

## During

- Small, mechanical steps; keep the code working between steps.
- Find all call sites with search (`rg -n "\bname\b"`, `git grep -w`), including string references, dynamic imports, config, docs and tests.
- Don't mix behavior changes into a refactor. If you find a bug, report it separately.
- Match existing conventions; don't reformat untouched code.
- Delete what your refactor orphaned; leave pre-existing dead code unless asked (mention it).

## After

- Same tests, same results. Plus typecheck/lint/build if the project has them.
- Review the diff: it should read as pure restructuring.

## Smells worth acting on (only when in scope)

Duplication that has already caused a bug, functions doing several unrelated things, leaky abstractions forcing callers to know internals. Not worth acting on: a single-use abstraction someone "might need later".

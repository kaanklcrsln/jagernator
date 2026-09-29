---
name: testing
description: Writing, running and fixing tests; choosing which checks to run; turning requirements into verifiable test cases. Use when adding tests, when tests fail, or when deciding how to verify a change.
---

# Testing

## Choose checks from the project, not from habit

Inspect tooling before running anything: `package.json` scripts, `Makefile`, `pyproject.toml`, `go.mod`, `Cargo.toml`, CI config. Jagernator lists detected validation commands in your instructions; prefer them.

Run the **narrowest relevant** checks first (single test file or test name), then the broader suite if the change can affect other areas. Don't run every check for a trivial change; don't skip the suite for a cross-cutting one.

## Writing tests

- Test behavior through the public interface, not implementation details.
- One reason to fail per test; name it after the behavior (`rejects expired tokens`).
- For bugs: write the failing test first, watch it fail for the right reason, then fix.
- Cover the boundary that matters (empty, one, many, invalid, limit), not every permutation.
- Match the existing framework, file layout, fixtures and helpers. Don't introduce a new test library.
- Deterministic: no real network, clock or randomness unless controlled.

## Fixing failing tests

1. Read the assertion diff and the first relevant stack frame.
2. Decide: is the **code** wrong or the **test** wrong? Only change the test when the expected behavior legitimately changed; say so.
3. Never delete, skip or loosen a test to get green without the user's agreement.

## Reporting

Report the command and the result ("`npm test`: 142 passed, 0 failed"). If checks could not run, say why. Never report "tests pass" without running them in this session.

# Contributing to Jagernator

Jagernator follows its own policy (`policies/engineering.md`): minimum code, surgical changes, verified results.

## Setup

```sh
node --version   # >= 20
npm test
npm run check
node evals/run.js --self-test
```

There are no runtime dependencies. Adding one needs a strong reason; prefer the Node standard library.

## Guidelines

- **Keep the core provider-independent.** Agent-specific logic belongs in `src/adapters/`.
- **Deterministic over judgment.** If a rule can be checked in code, check it in code and test it.
- **No fake guarantees.** A control that isn't enforced must be documented as guidance. Security claims in docs must match `src/security/` behavior and its tests.
- **No fake numbers.** Token counts come from providers or are labelled estimates. Eval results come from runs.
- **Metadata, not content.** Never persist file contents or unredacted strings in state or logs.
- **Idempotency.** `init`/`update` must produce no changes on a second run; add a test when you touch the installer.

## Adding a skill

1. `skills/<name>/SKILL.md` with frontmatter `name` (matching the directory) and `description` (what it covers and when to use it, ≤ 1024 characters).
2. Optional `references/*.md` for detail loaded on demand.
3. Add the name to `CORE_SKILLS` in `src/config/schema.js` if it should be enabled by default.
4. `npm test`.

## Adding an adapter

Add a function to `adapters` in `src/adapters/index.js` returning `block` / `file` / `json` operations, add the agent to `AGENTS` in `src/config/schema.js`, document enforcement status honestly, and add generation tests in `tests/adapters.test.js`.

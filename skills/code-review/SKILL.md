---
name: code-review
description: Reviewing a diff, branch or PR for correctness, security, simplicity and scope. Use when asked to review code and before completing your own non-trivial change.
---

# Code Review

Review the diff, not the repository. Start with `git diff --stat`, then `git diff` per file; open surrounding code only where the diff's correctness depends on it.

## Order of concerns

1. **Correctness.** Does it do what was asked? Edge cases, error paths, off-by-one, null/empty, concurrency, resource cleanup.
2. **Security.** Injection, authz checks, secrets in code/logs, unsafe deserialization, path traversal, new network egress.
3. **Scope.** Every line traces to the request, a necessary consequence, or verification/safety. Flag unrelated refactors, reformatting, drive-by renames.
4. **Simplicity.** Speculative abstractions, unneeded configurability, defensive code for impossible states, 200 lines that could be 50.
5. **Tests.** Is the change covered? Does a bug fix have a regression test?
6. **Consistency.** Matches project conventions and existing helpers.

## Output

One finding per line, most severe first:

```
path:line: [severity] problem. suggested fix.
```

Severities: `bug`, `security`, `scope`, `simplify`, `test`, `nit`. Skip nits unless asked. No praise padding. If nothing survives scrutiny, say "No issues found" and name what you checked.

## Self-review before completing

Run through the list on your own diff. Remove debug output, commented-out code and orphans your change created.

---
name: git
description: Git operations - inspecting history, staging, commits, branches, rebases, resolving conflicts, preparing PRs. Use when the task involves version control state or history.
---

# Git

## Inspect cheaply

`git status --short`, `git diff --stat`, `git diff -- <path>`, `git log --oneline -n 20 -- <path>`, `git show --stat <sha>`, `git blame -L a,b <file>`. Prefer these over reading whole files to understand what changed.

## Commits

- Commit only when the user asks. Branch first if on the default branch.
- Stage explicitly (`git add <paths>`), never `git add -A` blindly; review `git diff --cached` before committing.
- Never commit secrets, `.env` files, credentials, large binaries or build output. Check `git diff --cached` for them.
- One logical change per commit. Message: imperative subject ≤ 50 chars; body explains *why* when not obvious.

## Safety

- Destructive operations (`reset --hard`, `push --force`, `clean -fd`, `branch -D`, rebase of shared branches) need explicit user approval. Prefer `--force-with-lease`.
- `git push`, `gh pr create`, issue comments and PR descriptions **leave the machine**. Under Jagernator's default `external_source_upload: deny`, pushing is blocked until the user allows it. Before writing a PR description or issue, check it contains no secrets, internal hostnames, customer data or log excerpts.
- Don't rewrite history the user didn't ask you to rewrite.

## Conflicts

Understand both sides (`git diff --merge`, `git log --merge -p -- <file>`) before resolving. Resolve to the intended combined behavior, then run the relevant tests.

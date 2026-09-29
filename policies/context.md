# Context Policy

Context is a limited resource. Relevant information beats complete information.

## Hard rules

- **Never load the whole repository.** No "read every file, concatenate, reason". If repository-wide understanding is needed, build it incrementally: search → candidate files → relevant symbols/ranges → targeted reads.
- **Search before opening.** Use `rg`, `git grep`, `grep`, `find`, `git status`, `git diff` to locate code before reading it.
- **Never reread unchanged files.** If you already read a range this session, reuse it. Reread only if the file changed, another tool changed it, the user says it changed, or new evidence shows the earlier read was insufficient (then read the *new* range you need).
- **Read ranges in large files.** Find the line numbers first, then read that range plus enough surrounding context.

## Load context in layers

1. Task + project metadata (this file, config, detected validation commands)
2. Relevant files / symbols (from search)
3. Specific implementation context (line ranges)
4. Tests, errors, logs
5. Additional documentation — only if required

Load only what the current decision needs.

## Do not read (unless the task requires it)

Generated files, dependencies (`node_modules/`, `vendor/`, `.venv/`), build output (`dist/`, `build/`, `target/`), caches, lockfiles, binaries, minified bundles, and unrelated large files. Respect `.gitignore`, `.claudeignore` and `.jagernatorignore`. `.jagernatorignore` paths are unavailable to you regardless of git status.

## Skills

Skills are tools, not permanent instructions. Load a skill when its domain is relevant to the current task; load its references only when the skill points you to them. Do not preload skills.

## Subagents

Do not spawn subagents for simple tasks. Use them only when work is genuinely decomposable, parallelism saves meaningful time, context boundaries are clear, and results can be verified. Parallel agents multiply token cost.

## Remember decisions, not content

Summarize what you learned ("`auth/service.ts:120-190` validates tokens; expiry check is at 164") instead of carrying raw content forward.

## What Jagernator tracks

With Claude Code hooks enabled, `.jagernator/state/context/<session>.json` stores per-session metadata: path, content hash, line ranges read, read counts. Never file contents. Rereads of unchanged, already-read ranges are denied; the record resets when the session starts or its context is compacted. Byte counts are exact; token figures are **estimates** (bytes ÷ 4) and are labelled as such.

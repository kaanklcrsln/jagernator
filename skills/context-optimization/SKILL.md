---
name: context-optimization
description: Efficient context usage - locating code with search, reading line ranges, avoiding duplicate reads, investigating large repositories incrementally. Use at the start of exploration and whenever a task needs code you haven't located yet.
---

# Context Optimization

Spend context on what the current decision needs. Never spend it on proof you skipped: verification is not optional.

## Locate before reading

```
task → search → candidate files → symbols/line ranges → targeted read → reason
```

- Symbols: `rg -n "\b(function|class|def|fn|func) name\b"`, `rg -n "name\(" --type ts`, `git grep -n -w name`.
- Files: `git ls-files '*auth*'`, `rg --files -g '*.sql'`.
- Scope searches to directories; use `-l` to list files first when results would be large.
- Structure: `ls`, `git ls-files | sed 's|/[^/]*$||' | sort -u | head -50` instead of reading files to learn layout.

## Read narrowly

- Read the line range around the search hit (±20–40 lines), widen only if needed.
- Files over ~100 KB or thousands of lines: never read whole. Jagernator's hook denies whole-file reads above `context.large_file_bytes`.
- Skip generated code, dependencies, build output, lockfiles, minified bundles.

## Don't reread

- Already read an unchanged range this session? Use what you have. Jagernator denies such rereads when hooks are enabled.
- If a file changed (you edited it, a tool regenerated it), reread only the changed region.
- Before rereading "just to be sure", ask what new information you expect.

## Keep conclusions, drop content

Carry forward decisions and locations (`src/db/pool.ts:40-72 creates the pool; timeout hardcoded at 58`), not pasted code.

## On-demand loading

- Load a skill only when its domain matters; load its `references/` only when it points you there.
- Don't preload documentation; open the section you need.
- Don't spawn subagents for work you can do in a few targeted searches.

## Large repositories

Incremental map: top-level layout → entry point → the one subsystem involved → its tests. Record findings as you go (`jagernator task note decision "..."`) so later steps don't repeat the survey.

See `references/search-recipes.md` for more recipes.

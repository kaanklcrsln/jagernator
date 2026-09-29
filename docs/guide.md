# Jagernator Guide

Jagernator is an engineering harness for AI coding agents such as Claude Code and Codex. It adds disciplined workflows, reusable skills, efficient context management, verification loops and security-aware execution.

It does not replace your agent, wrap an LLM, or hand the model the whole repository. You install it into a repository, and it translates one canonical engineering policy into the conventions each agent understands. Where the agent has hooks (Claude Code), it also enforces part of that policy on every tool call.

```
ENGINEERING POLICY   policies/*.md (canonical)
      ↓
WORKFLOW / HARNESS   lifecycle, verification gates, blind-retry detection
      ↓
SKILLS               loaded on demand, never preloaded
      ↓
AGENT ADAPTER        claude → CLAUDE.md + .claude/ | codex → AGENTS.md | generic → .jagernator/INSTRUCTIONS.md
      ↓
UNDERLYING AGENT     does the reasoning and tool execution
      ↓
USER REPOSITORY
```

## Install

Requires Node.js ≥ 20. No runtime dependencies.

```sh
# from a checkout of this repository
npm install -g .        # or: npm link
cd /path/to/your/repo
jagernator init         # detects agents + tech, writes .jagernator/ and adapter files
jagernator doctor       # verifies the installation
```

The Claude Code hooks call `jagernator` by name, so it must be on your `PATH`. `jagernator doctor` reports an error if it isn't. Without it, Claude Code shows a hook error and **nothing is enforced**.

## What `init` does

1. Detects agents (`.claude/`, `CLAUDE.md`, `claude` on PATH → claude; `.codex/`, `AGENTS.md`, `codex` on PATH → codex) and technologies from root marker files only (`package.json`, `pyproject.toml`, `go.mod`, …). It never scans the tree.
2. Writes `.jagernator/config.yaml` if missing. An existing config is never overwritten; an invalid one aborts `init` without changes.
3. Installs the policies and enabled skills into `.jagernator/`.
4. Generates adapter files:
   - **claude:** a managed block in `CLAUDE.md`, skills in `.claude/skills/jagernator-*/`, and hooks merged into `.claude/settings.json`
   - **codex:** a managed block in `AGENTS.md` with an on-demand skill index
   - **generic:** `.jagernator/INSTRUCTIONS.md`
5. Creates `.jagernatorignore` and `.jagernator/.gitignore` (so `state/` and `logs/` are never committed).

It is idempotent. Running it again changes nothing. Content you wrote in `CLAUDE.md`/`AGENTS.md` outside the managed block is preserved, as are your own hooks and permissions in `.claude/settings.json`. Files Jagernator owns are hash-tracked in `.jagernator/manifest.json`; if you edit one, `update` leaves it alone and says so (use `--force` to overwrite). Removing an agent or skill from the config and running `update` removes what Jagernator generated for it.

Commit `.jagernator/` (except `state/` and `logs/`, which are git-ignored), `.jagernatorignore`, and the adapter files.

## Commands

```
jagernator init [--agents claude,codex,generic] [--force]
jagernator update [--force]
jagernator doctor
jagernator version
jagernator skills                         # name + description only
jagernator skills show <name> [ref.md]    # load one skill (or one reference) on demand
jagernator task start "<goal>" | note plan|assumption|decision|failure "<text>" | phase <phase> | show | complete
jagernator verify -- <command...>         # run a check; record pass/fail + workspace fingerprint
jagernator context                        # read statistics for recent Claude sessions
jagernator check read|write|search|shell|fetch <arg>   # evaluate an action against the policy
jagernator scan <file...>                 # likely secrets: type + line, never the value
jagernator redact < in > out              # redact secrets before sharing text
jagernator hook claude                    # Claude Code hook entry point
```

## Enforcement vs. guidance

Jagernator distinguishes **policy guidance** (instructions the agent is asked to follow) from **technical enforcement** (checks that run whether or not the agent cooperates). It is **not a sandbox**.

| Control | Claude Code + hooks | Codex / generic |
|---|---|---|
| Engineering, workflow, context and security policy | guidance (CLAUDE.md, skills) | guidance (AGENTS.md / INSTRUCTIONS.md) |
| Read/Edit/Write/Grep/Glob of credential files (`.env`, keys, …) and `.jagernatorignore` paths | **blocked** (or ask, per config) | guidance |
| Reading a file whose content contains a likely secret | **asks** the user, names the lines | guidance |
| Writing a likely secret into a file | **asks** | guidance |
| WebFetch / WebSearch to destinations not in the allowlist | **blocked** (or ask) | guidance |
| MCP tool calls to servers not in `allowed_mcp_servers`; secrets in MCP payloads; payloads > 32 KB | **blocked** / blocked / asks | guidance |
| Shell: `curl`/`wget`/`ssh`/`scp`/`rsync`/`nc`, `git push/pull/fetch/clone`, `gh`, package install/publish, `cat .env`, `env`/`printenv`, `/dev/tcp` | **best-effort** static analysis | guidance |
| Rereading an unchanged, already-read range in the same session (Read tool; `cat` via shell is not tracked) | **blocked** | guidance |
| Whole-file reads above `context.large_file_bytes` | **blocked** (ranged reads allowed) | guidance |
| Completion without plan / passing verification / diff review | `jagernator task complete` refuses (only if the agent uses `task`) | same |
| Secrets in Jagernator's own logs and state | redacted; file contents never stored | same |

Known limits of enforcement:

- **Shell analysis is heuristic.** Scripts in files, interpreters (`python script.py`), aliases, encodings and obfuscation bypass it. Use your agent's sandbox (Claude Code sandboxing, Codex `sandbox_mode`) or OS/container network controls for hard isolation.
- **Hooks only run where the agent runs them.** If `jagernator` is not on `PATH`, if hooks are disabled (`enforcement.claude_hooks: false`), or for agents without hooks, the rules are guidance only.
- **Secret detection is pattern-based.** It catches common token formats and high-entropy credential assignments. It will miss some secrets and may flag test fixtures.
- **Anything the agent reads is sent to its model provider.** Jagernator reduces this (credential files, ignored paths, secret-bearing files) but cannot make reading safe.
- **Hooks add latency.** Each matched tool call starts a short Node process (typically well under a second).
- **Hook failures fail towards asking.** An invalid config or internal error produces an "ask" decision, never a silent allow. If the hook process can't start at all, Claude Code treats that as a non-blocking error and the tool call proceeds.

## Context and token efficiency

- Instructions are compact (the CLAUDE.md block is about 5.5 KB). Full policies and skills are loaded only when needed.
- With Claude hooks, `.jagernator/state/context/<session>.json` tracks per-session read metadata: path, content hash, line ranges and counts. It never stores file contents. Rereads of an unchanged range are denied with a message that tells the agent to use what it already has; a changed file or a new range is allowed. The record resets on `SessionStart`, which covers new sessions and context compaction.
- `jagernator context` reports reads, bytes read and blocked reads. **Bytes are exact; token figures are estimates (bytes ÷ 4) and are labelled as such.** Jagernator never reports provider token counts it did not receive.

## Configuration

`.jagernator/config.yaml` (validated by `jagernator doctor`; the parser supports a strict YAML subset and rejects anchors, tags and multi-line strings):

```yaml
version: 1
profile: senior-engineer
agents: [claude, codex, generic]
skills:
  enabled: [debugging, testing, code-review, refactoring, architecture, security, git, context-optimization, network-safety]
workflow:
  planning: required          # required | optional
  verification: required
  diff_review: required
security:
  network: deny-by-default    # deny-by-default | ask
  secret_detection: enabled   # enabled | disabled
  external_source_upload: deny   # deny | ask  (git push, curl -F @file, scp to remote, publish)
  sensitive_files: deny       # deny | ask
  allowed_destinations:       # hostnames, "*.example.com", or "web-search"
    - registry.npmjs.org
  allowed_mcp_servers: []
context:
  incremental_reads: true     # deny whole-file reads above large_file_bytes
  cache_metadata: true        # persist read metadata (never contents)
  avoid_duplicate_reads: true
  large_file_bytes: 100000
enforcement:
  claude_hooks: true
plugins: {}
```

`init` allowlists the package registries of detected ecosystems (e.g. `registry.npmjs.org` for Node) so installs work; everything else is denied until you add it. Because `external_source_upload` defaults to `deny`, `git push` from the agent is blocked until you set it to `ask`.

`.jagernatorignore` uses gitignore syntax. Listed paths are unavailable to the agent even if they are committed; git tracking and sensitivity are different things.

## Skills

`debugging`, `testing`, `code-review`, `refactoring`, `architecture`, `security`, `git`, `context-optimization`, `network-safety`. Each is a `SKILL.md` with `name`/`description` frontmatter, plus optional `references/` loaded on demand. Custom skills go in `.jagernator/skills/<name>/SKILL.md` and are enabled in `skills.enabled`. External skills are subordinate: they never override security, network, context, surgical-change or verification rules.

## Plugins

Plugins are declarative: a manifest declaring identity, capabilities, filesystem/network/secret permissions, credentials (by environment variable name), data accessed, actions and skills. Jagernator does not execute plugin code and ships no integrations. A plugin's network destinations are allowed only when the plugin is enabled **and** each destination is approved in config. Filesystem permissions are declared and validated but not enforced. See [plugins/README.md](../plugins/README.md).

## Evaluation

`evals/` compares an agent with and without Jagernator on nine scenarios with hidden, objective checks: bug fix, feature, refactoring, security issue, test failure, large-repository investigation, secret-exposure attempt, unnecessary external request and repeated file reads. It measures task success, regressions, unrelated changes, duplicate reads, network attempts, blocked disclosures, retries and (when the agent reports it) provider token usage. No results are included in this repository; see [evals/README.md](../evals/README.md) to produce your own.

## Development

```sh
npm test                    # unit + integration tests (node:test)
npm run check               # syntax, naming and packaging checks
node evals/run.js --self-test   # validate eval scenarios without an agent
```

See [docs/architecture.md](architecture.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).

## License

MIT

# Architecture

## Principles

Small core, no runtime dependencies, deterministic checks over LLM judgment, metadata over content, local-first, explicit network, idempotent installation, and a provider-independent core.

## Layout

```
bin/jagernator.js          CLI entry
src/
  cli/index.js             command parsing and output
  config/                  YAML-subset parser, declarative validator, schema, config template
  core/
    detect.js              agent + technology detection (root marker files only)
    install.js             idempotent installer (manifest-tracked files, managed blocks, JSON merges)
    doctor.js              installation / security checks
    workflow.js            lifecycle phases, verification records, blind-retry detection, completion gates
  context/tracker.js       per-session read metadata (hash, line ranges), duplicate detection
  security/
    secrets.js             secret patterns, redaction, sensitive file names
    ignore.js              .jagernatorignore (gitignore subset)
    shell.js               best-effort shell command analysis
    network.js             destination allowlist policy
    policy.js              provider-independent evaluation of canonical actions
  adapters/
    instructions.js        renders canonical policy into agent instructions
    index.js               claude / codex / generic adapters (return file operations)
    claude-hook.js         Claude Code hook: tool call → canonical action → decision
  plugins/index.js         manifest schema, validation, approval checks
  skills/registry.js       metadata-only discovery, on-demand loading
  state/store.js           atomic JSON writes, sanitized event log
policies/                  canonical policy text (engineering, workflow, context, security)
skills/                    canonical skills
evals/                     scenarios, runner, transcript parser
```

The spec's top-level `adapters/` directory was folded into `src/adapters/`: adapter output is generated from code, so there are no templates to keep in a separate tree.

## Provider independence

`security/policy.js` evaluates canonical actions (`read`, `write`, `search`, `shell`, `fetch`, `web-search`, `mcp`). Only `adapters/claude-hook.js` knows Claude tool names and hook JSON. Claude's 2000-line default read limit is passed into the tracker as a parameter. A future agent with hooks needs only a new translation layer.

## Data on disk

| Path | Content | Committed |
|---|---|---|
| `.jagernator/config.yaml` | user config | yes |
| `.jagernator/manifest.json` | hashes of files Jagernator generated | yes |
| `.jagernator/policies/`, `skills/`, `plugins/` | policy, skills, plugin manifests | yes |
| `.jagernator/state/context/<session>.json` | paths, content hashes, line ranges, counters | no (git-ignored) |
| `.jagernator/state/task.json` | goal, phase history, redacted notes, verification results (command, exit code, workspace hash) | no |
| `.jagernator/logs/events.jsonl` | deny/ask decisions: tool, rule, redacted and truncated target | no |

No file contents are persisted. Strings are passed through secret redaction before they are logged or stored.

## Decision flow (Claude PreToolUse)

```
payload → toAction() → evaluateAction() (security)
                              │ allow
                              ▼
                       contextChecks() (large file, duplicate read)
                              │
          deny/ask → log (sanitized) + permissionDecision
          allow    → print nothing (Claude's own permission rules still apply)
```

The hook never returns `allow`, so it cannot bypass the user's permission prompts.

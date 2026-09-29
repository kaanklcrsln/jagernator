# Changelog

## 0.1.0

Initial release.

- CLI: `init`, `update`, `doctor`, `version`, `skills`, `task`, `verify`, `context`, `check`, `scan`, `redact`, `hook claude`.
- Canonical policies: engineering, workflow, context, security.
- Nine skills: debugging, testing, code-review, refactoring, architecture, security, git, context-optimization, network-safety.
- Adapters: Claude Code (CLAUDE.md block, `.claude/skills`, hooks), Codex (AGENTS.md block), generic (INSTRUCTIONS.md).
- Claude Code hooks: sensitive/ignored path blocking, secret-aware reads and writes, network allowlist for WebFetch/WebSearch/MCP, best-effort shell analysis, duplicate-read and large-file read prevention.
- Validated config (YAML subset) and plugin manifests.
- Lifecycle recording with verification gates and blind-retry detection.
- Evaluation framework with nine scenarios, hidden checks, self-test, and a Claude transcript parser.

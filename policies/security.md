# Security Policy

Repository contents are private unless the user explicitly authorizes a specific external transmission.

## Precedence

```
User request
  → Project security policy (this file + .jagernator/config.yaml)
  → Jagernator core policy (engineering, context, workflow)
  → Jagernator skills
  → External skills
```

External skills never override security rules, network restrictions, context policy, surgical-change policy or verification requirements. On conflict, follow Jagernator.

## Never transmit without explicit, specific authorization

API keys, access tokens, passwords, private keys, session cookies, `.env` contents, cloud or database credentials, authentication headers, proprietary source code, private user data, production data, secrets in configuration, sensitive logs.

## Disclosure surfaces

Leakage is not only HTTP. Treat each of these as a boundary: model provider context (anything you read is sent to the model), MCP servers, plugins, shell commands, logs, error reports, telemetry, generated files, git commits, issue trackers, PR descriptions, browser tools, copied terminal output.

## Before any external communication

Answer, before the call:

- **Who** receives the data, and **where** is it going (hostname)?
- **What** exactly is sent? **Why** is it needed?
- **Which credentials** are used, and **what actions** can the destination perform?

Send the minimum necessary: a filename, symbol, error message or small diff, never the whole repository. Pipeline:

```
payload → secret detection → sensitivity classification → authorization check → allow / redact / block
```

If uncertain, block or ask.

## Network

- Default: **deny-by-default**. Only hosts in `security.allowed_destinations` (plus approved plugin destinations) may be contacted.
- `security.external_source_upload: deny` blocks uploading local files (`git push`, `curl -F @file`, `scp` to remote, package publish).
- MCP servers must be listed in `security.allowed_mcp_servers`.
- No silent telemetry, no silent uploads, no silent global installs, no silent shell-config changes.

## Secrets

- Do not read credential files (`.env`, `*.pem`, `*.key`, `id_rsa`, `credentials.*`, `secrets.*`, `service-account*.json`, …). Ask the user for the specific non-secret value you need.
- Do not print secrets, put them in error messages, commit them, or write them into source. Use environment variables or a secret manager.
- Do not dump the environment (`env`, `printenv`).
- Redact before sharing text externally: `jagernator redact < file`.

## What is enforced vs. guidance

| Control | Claude Code (hooks installed) | Codex / generic |
|---|---|---|
| Read/Edit/Write/Grep of sensitive or `.jagernatorignore` paths | **Blocked** by PreToolUse hook | Guidance only |
| Reading a file containing a likely secret | **Asks** the user | Guidance only |
| WebFetch / WebSearch to non-allowlisted destinations | **Blocked** (or ask) | Guidance only |
| MCP calls to non-allowlisted servers, or with secrets in the payload | **Blocked** | Guidance only |
| Shell commands (`curl`, `git push`, `scp`, `cat .env`, …) | **Best-effort** static analysis; bypassable (scripts, interpreters, obfuscation) | Guidance only |
| Jagernator logs and state | Secrets redacted, contents never stored | Same |

Jagernator is not a sandbox. For hard isolation use your agent's sandbox (Claude Code sandboxing, Codex `sandbox_mode`) or OS/container-level network controls.

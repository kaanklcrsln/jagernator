---
name: network-safety
description: Any action that sends data off the machine - web fetch/search, APIs, MCP servers, plugins, package registries, git push, issue trackers, PR text, pasting logs. Use before every external communication and when handling secrets or private data.
---

# Network Safety

Default assumption: repository contents are private. Every external call is a potential exfiltration boundary. Be conservative with proprietary repositories.

## Before any external call

1. **Classify the data** you would send (see `references/data-classification.md`): public, internal, confidential, secret.
2. **Detect secrets.** Keys, tokens, passwords, private keys, cookies, `.env` values, connection strings, auth headers. Found one → do not send.
3. **Validate the destination.** Exact hostname. Is it in `security.allowed_destinations` (or an approved plugin destination)? Is it the service the user intended, not a look-alike or redirect?
4. **Minimize.** Send the smallest payload that works: a package name, an error message with paths/hosts stripped, a 10-line snippet, never whole files or the repository.
5. **Authorize.** Confidential data or new destinations require the user's explicit approval for this specific transmission. Approval for one transmission doesn't extend to the next.
6. **Redact** what remains: `jagernator redact < payload.txt`.

If uncertain at any step: block or ask.

## Surfaces people forget

Model context (anything you read goes to the provider), MCP tool arguments, plugin calls, `curl`/`wget` in shell, package install/publish, `git push`, `gh pr create` bodies, issue comments, error reports, telemetry, generated docs, copied terminal output.

## Plugins and MCP servers

- Trust boundary = the destination, not the tool name. Know WHO receives data, WHAT is sent, WHY, WHERE, with WHICH credentials, and WHAT actions it can perform.
- Only call MCP servers in `security.allowed_mcp_servers`; send identifiers, not bulk content.
- Plugins declare their destinations and credentials in `plugin.json`; a destination works only after the user approves it in config.

## Never

- Paste `.env`, production logs, customer data, credentials or private keys into any external system.
- Put secrets in URLs, query strings, commit messages or PR descriptions.
- Enable telemetry, upload source, or contact new hosts silently.
- Work around a Jagernator block with an alternative command. A block means ask the user.

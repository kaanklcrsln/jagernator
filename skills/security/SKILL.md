---
name: security
description: Security-sensitive code and reviews - authentication, authorization, input handling, injection, secrets, crypto, dependency risk. Use when writing or reviewing code on a trust boundary or when a vulnerability is reported.
---

# Security

## Threat-model the change (briefly)

What input crosses a trust boundary? Who can call this? What's the worst outcome? Focus effort there.

## Checklist

- **Injection:** parameterized queries; no string-built SQL/shell/HTML; escape at the output context.
- **AuthN/AuthZ:** check authorization on every access path, server-side, by resource ownership, not just by "logged in".
- **Input:** validate type, size and range at the boundary; reject rather than sanitize-and-continue when possible.
- **Paths:** resolve and confine to an allowed root (path traversal).
- **Secrets:** never in source, logs, error messages, URLs or commits. Load from environment/secret manager. If you find one committed, tell the user; it must be rotated, not just deleted.
- **Crypto:** use the platform's vetted primitives; no homemade crypto; constant-time comparison for tokens.
- **Deserialization / templates / eval:** never on untrusted input.
- **Dependencies:** don't add packages casually; prefer the standard library. Check maintenance and install scripts before adding.
- **Errors:** fail closed; don't leak internals to callers.

## Verification

Security fixes need a test that demonstrates the exploit path is closed (e.g. traversal input rejected, unauthorized user gets 403). Permission behavior must be verified against actual grants/policies, not inferred from types.

## Secret handling in the agent itself

Don't read credential files; don't echo environment variables; redact before sharing (`jagernator redact`). See the `network-safety` skill for external communication and `references/secret-patterns.md` for what Jagernator detects.

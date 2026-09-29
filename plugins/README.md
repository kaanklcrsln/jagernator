# Jagernator plugins

A plugin is a **declarative bundle**: a manifest plus optional skills. Jagernator validates the manifest, shows it in `jagernator doctor`, installs the plugin's skills, and adds its network destinations to the allowlist only after the user approves them. **Jagernator never executes plugin code**, and this repository ships no plugin integrations.

## Layout

```
.jagernator/plugins/<name>/
├── plugin.json
└── skills/<skill>/SKILL.md      # optional
```

## Manifest

```json
{
  "name": "issue-tracker",
  "version": "0.1.0",
  "description": "Look up issues referenced in commit messages",
  "capabilities": ["read-issues"],
  "permissions": {
    "filesystem": { "read": [], "write": [] },
    "network": { "destinations": ["api.tracker.example"] },
    "secrets": { "access": true }
  },
  "credentials": [{ "env": "TRACKER_TOKEN", "purpose": "read-only API token" }],
  "data_accessed": ["issue ids from commit messages"],
  "actions": ["GET /issues/:id"],
  "skills": ["triage"]
}
```

Validation rules (`src/plugins/index.js`):

- `name` matches the directory; `version` is semver.
- Network destinations are explicit hostnames (`*.host` allowed; a bare `*` is not).
- Credentials are declared by **environment variable name**. A manifest containing something that looks like a secret value is rejected.
- Declaring credentials requires `permissions.secrets.access: true`.
- Every declared skill must exist under `skills/<skill>/SKILL.md`.
- Unknown keys are errors.

## Enabling

```yaml
# .jagernator/config.yaml
plugins:
  issue-tracker:
    enabled: true
    approved_destinations:
      - api.tracker.example
```

A destination works only if the plugin **declares** it **and** the user **approves** it. `doctor` reports a declared destination that has not been approved, and treats an approved destination the plugin never declared as an error. Run `jagernator update` after enabling a plugin so its skills are installed for your agents.

## What is and isn't enforced

| Permission | Status |
|---|---|
| `network.destinations` | Feeds the network allowlist that the Claude Code hook enforces (WebFetch, and best-effort for shell commands). |
| `filesystem.read` / `write` | Declared and validated, **not enforced**. Plugins run through the agent, which has the agent's file access. |
| `secrets.access`, `credentials` | Declared and validated, **not enforced**. They document what the plugin needs so the user can decide. |

If you need hard guarantees, run the agent in a sandbox or container with its own network policy.

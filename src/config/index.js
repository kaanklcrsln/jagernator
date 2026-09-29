import fs from 'node:fs';
import path from 'node:path';
import { parseYaml, YamlError } from './yaml.js';
import { validate } from './validate.js';
import { configSchema, CORE_SKILLS } from './schema.js';

export const JAG_DIR = '.jagernator';
export const configPath = (root) => path.join(root, JAG_DIR, 'config.yaml');

export class ConfigError extends Error {
  constructor(file, errors) {
    super(`Invalid Jagernator config (${file}):\n  - ${errors.join('\n  - ')}`);
    this.errors = errors;
  }
}

/** Parse and validate config text. Returns { config, errors }. */
export function parseConfig(text) {
  let raw;
  try {
    raw = parseYaml(text);
  } catch (err) {
    if (err instanceof YamlError) return { config: null, errors: [`YAML: ${err.message}`] };
    throw err;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: null, errors: ['config must be a mapping'] };
  }
  const errors = [];
  const config = validate(raw, configSchema, '', errors);
  return { config: errors.length ? null : config, errors };
}

/** Load config from a project root. Returns null if missing; throws ConfigError if invalid. */
export function loadConfig(root) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return null;
  const { config, errors } = parseConfig(fs.readFileSync(file, 'utf8'));
  if (errors.length) throw new ConfigError(file, errors);
  return config;
}

/** Defaults used when a hook runs without a config (should not happen after init). */
export function defaultConfig() {
  return validate({ version: 1 }, configSchema, '', []);
}

const list = (items, pad) => (items.length ? items.map((i) => `\n${pad}- ${i}`).join('') : ' []');

/** Render the initial config.yaml. Only called when no config exists. */
export function renderConfig({ agents, allowedDestinations }) {
  return `# Jagernator configuration. Validate with: jagernator doctor
version: 1
profile: senior-engineer

# Adapters to generate: claude (CLAUDE.md + .claude/), codex (AGENTS.md), generic (.jagernator/INSTRUCTIONS.md)
agents:${list(agents, '  ')}

skills:
  enabled:${list(CORE_SKILLS, '    ')}

workflow:
  planning: required        # required | optional
  verification: required    # required | optional
  diff_review: required     # required | optional

security:
  network: deny-by-default        # deny-by-default | ask
  secret_detection: enabled       # enabled | disabled
  external_source_upload: deny    # deny | ask
  sensitive_files: deny           # deny | ask (.env, keys, credentials, .jagernatorignore paths)
  # Hostnames the agent may contact. "*.example.com" matches subdomains; "web-search" allows web search.
  allowed_destinations:${list(allowedDestinations, '    ')}
  # MCP servers (by name) the agent may call. MCP tools are treated as an external boundary.
  allowed_mcp_servers: []

context:
  incremental_reads: true     # deny whole-file reads of files larger than large_file_bytes
  cache_metadata: true        # persist read metadata (paths, hashes, line ranges; never contents)
  avoid_duplicate_reads: true # deny rereads of unchanged, already-read ranges in the same session
  large_file_bytes: 100000

enforcement:
  claude_hooks: true          # install Claude Code hooks that enforce the rules above

# Plugins live in .jagernator/plugins/<name>/plugin.json and must be enabled here, e.g.:
#   my-plugin:
#     enabled: true
#     approved_destinations:
#       - api.example.com
plugins: {}
`;
}

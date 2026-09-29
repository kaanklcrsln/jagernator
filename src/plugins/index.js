// Plugins are declarative bundles (manifest + optional skills). Jagernator does not
// execute plugin code. A plugin's declared network destinations are added to the
// allowlist only when the user enables the plugin and approves each destination.
import fs from 'node:fs';
import path from 'node:path';
import { JAG_DIR } from '../config/index.js';
import { validate } from '../config/validate.js';
import { detectSecrets } from '../security/secrets.js';
import { discoverSkills } from '../skills/registry.js';

const NAME = /^[a-z0-9][a-z0-9-]*$/;
const HOST = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const strings = { type: 'array', default: [], items: { type: 'string' } };

export const manifestSchema = {
  type: 'object',
  props: {
    name: { type: 'string', pattern: NAME, patternHint: 'must be lowercase letters, digits and hyphens' },
    version: { type: 'string', pattern: /^\d+\.\d+\.\d+/, patternHint: 'must be semver' },
    description: { type: 'string' },
    capabilities: strings,
    permissions: {
      type: 'object',
      props: {
        filesystem: { type: 'object', default: {}, props: { read: strings, write: strings } },
        network: {
          type: 'object',
          default: {},
          props: { destinations: { type: 'array', default: [], unique: true, items: { type: 'string', pattern: HOST, patternHint: 'must be a hostname or *.hostname' } } },
        },
        secrets: { type: 'object', default: {}, props: { access: { type: 'boolean', default: false } } },
      },
    },
    credentials: {
      type: 'array',
      default: [],
      items: { type: 'object', props: { env: { type: 'string', pattern: /^[A-Z][A-Z0-9_]*$/, patternHint: 'must be an environment variable NAME, never a value' }, purpose: { type: 'string' } } },
    },
    data_accessed: strings,
    actions: strings,
    skills: strings,
  },
};

export const pluginsDir = (root) => path.join(root, JAG_DIR, 'plugins');

export function readPlugin(dir) {
  const file = path.join(dir, 'plugin.json');
  const plugin = { name: path.basename(dir), dir, manifest: null, valid: false, errors: [] };
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    plugin.errors.push('missing plugin.json');
    return plugin;
  }
  if (detectSecrets(text).length) plugin.errors.push('plugin.json appears to contain a secret value; declare credentials by environment variable name only');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    plugin.errors.push(`plugin.json is not valid JSON: ${err.message}`);
    return plugin;
  }
  const manifest = validate(raw, manifestSchema, '', plugin.errors);
  if (plugin.errors.length) return plugin;
  if (manifest.name !== plugin.name) plugin.errors.push(`name "${manifest.name}" does not match directory "${plugin.name}"`);
  if (manifest.credentials.length && !manifest.permissions.secrets.access) {
    plugin.errors.push('declares credentials but permissions.secrets.access is false');
  }
  const available = new Set(discoverSkills(path.join(dir, 'skills'), `plugin:${plugin.name}`).map((s) => s.name));
  for (const s of manifest.skills) if (!available.has(s)) plugin.errors.push(`declared skill "${s}" not found in skills/${s}/SKILL.md`);
  plugin.manifest = manifest;
  plugin.valid = plugin.errors.length === 0;
  return plugin;
}

export function loadPlugins(root) {
  const dir = pluginsDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readPlugin(path.join(dir, d.name)));
}

/** Problems with how the config enables plugins (unknown, invalid, unapproved destinations). */
export function checkPluginConfig(config, plugins) {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const problems = [];
  for (const [name, entry] of Object.entries(config.plugins)) {
    const p = byName.get(name);
    if (!p) problems.push({ level: 'error', message: `plugins.${name}: no manifest at .jagernator/plugins/${name}/plugin.json` });
    else if (entry.enabled && !p.valid) problems.push({ level: 'error', message: `plugins.${name}: enabled but invalid (${p.errors.join('; ')})` });
    else if (entry.enabled) {
      const declared = p.manifest.permissions.network.destinations;
      for (const d of declared) {
        if (!entry.approved_destinations.includes(d)) problems.push({ level: 'warn', message: `plugins.${name}: destination ${d} is declared but not approved; requests to it will be blocked` });
      }
      for (const d of entry.approved_destinations) {
        if (!declared.includes(d)) problems.push({ level: 'error', message: `plugins.${name}: approved destination ${d} is not declared by the plugin` });
      }
    }
  }
  return problems;
}

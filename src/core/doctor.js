import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigError, JAG_DIR, configPath, loadConfig } from '../config/index.js';
import { CORE_SKILLS } from '../config/schema.js';
import { claudeHooksInstalled } from '../adapters/index.js';
import { hasBlock } from '../adapters/instructions.js';
import { checkPluginConfig, loadPlugins } from '../plugins/index.js';
import { IGNORE_FILE } from '../security/ignore.js';
import { isSensitivePath } from '../security/secrets.js';
import { discoverSkills } from '../skills/registry.js';
import { readJson, stateDir } from '../state/store.js';
import { detectAgents, onPath } from './detect.js';
import { manifestPath } from './install.js';

/** Run all checks. Returns [{ level: 'ok'|'warn'|'error', area, message, fix? }]. */
export function doctor(root) {
  const out = [];
  const ok = (area, message) => out.push({ level: 'ok', area, message });
  const warn = (area, message, fix) => out.push({ level: 'warn', area, message, fix });
  const error = (area, message, fix) => out.push({ level: 'error', area, message, fix });
  const exists = (rel) => fs.existsSync(path.join(root, rel));

  // Configuration
  if (!fs.existsSync(configPath(root))) {
    error('config', `${JAG_DIR}/config.yaml not found`, 'run `jagernator init`');
    return out;
  }
  let config;
  try {
    config = loadConfig(root);
    ok('config', 'config.yaml is valid');
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    for (const e of err.errors) error('config', e, 'fix .jagernator/config.yaml');
    return out;
  }
  if (!config.context.cache_metadata && config.context.avoid_duplicate_reads) {
    warn('config', 'context.avoid_duplicate_reads has no effect while context.cache_metadata is false', 'enable cache_metadata or disable avoid_duplicate_reads');
  }

  // Installation consistency
  const manifest = readJson(manifestPath(root), null);
  if (!manifest) error('install', 'manifest.json missing; installation incomplete', 'run `jagernator update`');
  else {
    const missing = Object.keys(manifest.files).filter((f) => !exists(f));
    if (missing.length) error('install', `${missing.length} managed file(s) missing (e.g. ${missing[0]})`, 'run `jagernator update`');
    else ok('install', `${Object.keys(manifest.files).length} managed files present`);
  }
  for (const p of ['engineering.md', 'security.md', 'context.md', 'workflow.md']) {
    if (!exists(`${JAG_DIR}/policies/${p}`)) error('policies', `policies/${p} missing`, 'run `jagernator update`');
  }

  // Skills
  const installed = discoverSkills(path.join(root, JAG_DIR, 'skills'));
  const byName = new Map(installed.map((s) => [s.name, s]));
  for (const name of config.skills.enabled) {
    const s = byName.get(name);
    if (!s) error('skills', `enabled skill "${name}" is not installed`, CORE_SKILLS.includes(name) ? 'run `jagernator update`' : `create ${JAG_DIR}/skills/${name}/SKILL.md`);
    else if (s.errors.length) error('skills', `skill "${name}": ${s.errors.join('; ')}`, `fix ${JAG_DIR}/skills/${name}/SKILL.md`);
  }
  const missingCore = CORE_SKILLS.filter((n) => !config.skills.enabled.includes(n));
  if (missingCore.length) warn('skills', `core skills disabled: ${missingCore.join(', ')}`);
  if (!out.some((c) => c.area === 'skills' && c.level === 'error')) ok('skills', `${config.skills.enabled.length} skills enabled and valid`);

  // Agents and adapters
  const detected = detectAgents(root);
  for (const a of detected) if (!config.agents.includes(a)) warn('agents', `${a} detected but not in config.agents`, `add "${a}" to agents and run \`jagernator update\``);
  if (config.agents.includes('claude')) {
    const md = exists('CLAUDE.md') ? fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8') : null;
    if (hasBlock(md)) ok('claude', 'CLAUDE.md contains the Jagernator block');
    else error('claude', 'CLAUDE.md is missing the Jagernator block', 'run `jagernator update`');
    let settings = null;
    try {
      settings = exists('.claude/settings.json') ? JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8')) : {};
    } catch (err) {
      error('claude', `.claude/settings.json is not valid JSON: ${err.message}`, 'fix the file, then run `jagernator update`');
    }
    if (settings && config.enforcement.claude_hooks) {
      if (!claudeHooksInstalled(settings)) error('claude', 'Jagernator hooks are not installed in .claude/settings.json', 'run `jagernator update`');
      else if (!onPath('jagernator')) error('claude', 'hooks call `jagernator` but it is not on PATH; Claude Code will report hook errors and the rules will NOT be enforced', 'install globally (npm install -g jagernator) or npm link this package');
      else ok('claude', 'hooks installed and `jagernator` is on PATH');
    } else if (settings) warn('claude', 'enforcement.claude_hooks is false: security and context rules are guidance only');
  }
  if (config.agents.includes('codex')) {
    const md = exists('AGENTS.md') ? fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8') : null;
    if (hasBlock(md)) ok('codex', 'AGENTS.md contains the Jagernator block');
    else error('codex', 'AGENTS.md is missing the Jagernator block', 'run `jagernator update`');
    warn('codex', 'Codex has no Jagernator hooks: rules are guidance only. Use Codex sandbox_mode / network settings for enforcement');
  }
  if (config.agents.includes('generic') && !exists(`${JAG_DIR}/INSTRUCTIONS.md`)) error('generic', 'INSTRUCTIONS.md missing', 'run `jagernator update`');

  // State directory
  const sdir = stateDir(root);
  try {
    fs.mkdirSync(sdir, { recursive: true });
    fs.accessSync(sdir, fs.constants.W_OK);
    ok('state', 'state directory is writable');
  } catch (err) {
    error('state', `state directory not writable: ${err.code || err.message}`, `check permissions on ${sdir}`);
  }
  if (!exists(`${JAG_DIR}/.gitignore`)) warn('state', `${JAG_DIR}/.gitignore missing; state/ and logs/ could be committed`, 'run `jagernator update`');

  // Ignore rules and sensitive files
  if (!exists(IGNORE_FILE)) warn('ignore', `${IGNORE_FILE} not found`, 'run `jagernator update` to create one');
  let tracked = null;
  try {
    tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }).split('\0').filter(Boolean);
  } catch {
    warn('ignore', 'not a git repository; tracked-secret checks skipped');
  }
  if (tracked) {
    const sensitive = tracked.filter((f) => isSensitivePath(f));
    if (sensitive.length) {
      warn('secrets', `${sensitive.length} likely credential file(s) tracked by git: ${sensitive.slice(0, 5).join(', ')}${sensitive.length > 5 ? ', …' : ''}`, 'remove from git, rotate the credentials, and add them to .gitignore');
    } else ok('secrets', 'no credential-like files tracked by git');
  }

  // Security and network
  if (config.security.secret_detection !== 'enabled') warn('security', 'secret_detection is disabled');
  if (config.security.network !== 'deny-by-default') warn('network', `network mode is "${config.security.network}" (deny-by-default recommended)`);
  else ok('network', `deny-by-default; ${config.security.allowed_destinations.length} allowed destination(s)`);
  for (const d of config.security.allowed_destinations) {
    if (d.startsWith('*.') && d.split('.').length <= 2) warn('network', `broad wildcard destination "${d}"`, 'prefer exact hostnames');
  }
  if (config.security.external_source_upload !== 'deny') warn('network', 'external_source_upload is "ask": uploads of local files are allowed after confirmation');
  const mcp = readJson(path.join(root, '.mcp.json'), null);
  for (const server of Object.keys(mcp?.mcpServers || {})) {
    if (!config.security.allowed_mcp_servers.includes(server)) warn('network', `MCP server "${server}" (.mcp.json) is not in allowed_mcp_servers; its tools will be blocked`, 'add it to security.allowed_mcp_servers if you trust it');
  }

  // Plugins
  const plugins = loadPlugins(root);
  for (const p of plugins) {
    if (!p.valid) (config.plugins[p.name]?.enabled ? error : warn)('plugins', `${p.name}: ${p.errors.join('; ')}`);
  }
  for (const pr of checkPluginConfig(config, plugins)) (pr.level === 'error' ? error : warn)('plugins', pr.message);

  return out;
}

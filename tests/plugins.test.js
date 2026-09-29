import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config/index.js';
import { checkPluginConfig, loadPlugins } from '../src/plugins/index.js';
import { FAKE, tmpProject } from './helpers.js';

const manifest = (over = {}) => JSON.stringify({
  name: 'tracker',
  version: '0.1.0',
  description: 'Issue tracker lookups',
  capabilities: ['read-issues'],
  permissions: { filesystem: { read: [] }, network: { destinations: ['api.tracker.example'] }, secrets: { access: true } },
  credentials: [{ env: 'TRACKER_TOKEN', purpose: 'read issues' }],
  data_accessed: ['issue ids'],
  actions: ['GET /issues/:id'],
  skills: ['triage'],
  ...over,
});

test('valid plugin manifest with skill', () => {
  const root = tmpProject({
    '.jagernator/plugins/tracker/plugin.json': manifest(),
    '.jagernator/plugins/tracker/skills/triage/SKILL.md': '---\nname: triage\ndescription: triage issues\n---\n',
  });
  const [p] = loadPlugins(root);
  assert.deepEqual(p.errors, []);
  assert.equal(p.valid, true);
});

test('invalid manifests: wildcard-free hosts, env names, secrets, missing skills, mismatched names', () => {
  const root = tmpProject({
    '.jagernator/plugins/a/plugin.json': manifest({ name: 'a', skills: [], permissions: { network: { destinations: ['*'] } }, credentials: [] }),
    '.jagernator/plugins/b/plugin.json': manifest({ name: 'b', skills: [], credentials: [{ env: FAKE.github, purpose: 'x' }] }),
    '.jagernator/plugins/c/plugin.json': manifest({ name: 'c', permissions: { secrets: { access: false } } }),
    '.jagernator/plugins/d/plugin.json': manifest({ skills: [] }),
    '.jagernator/plugins/e/plugin.json': '{nope',
    '.jagernator/plugins/f/plugin.json': manifest({ name: 'f', skills: [], bogus: 1 }),
  });
  const errs = Object.fromEntries(loadPlugins(root).map((p) => [p.name, p.errors.join(' | ')]));
  assert.match(errs.a, /must be a hostname/);
  assert.match(errs.b, /appears to contain a secret/);
  assert.match(errs.b, /environment variable NAME/);
  assert.match(errs.c, /secrets.access is false/);
  assert.match(errs.c, /skill "triage" not found/);
  assert.match(errs.d, /does not match directory/);
  assert.match(errs.e, /not valid JSON/);
  assert.match(errs.f, /bogus: unknown key/);
});

test('plugin config checks approvals against declarations', () => {
  const root = tmpProject({
    '.jagernator/plugins/tracker/plugin.json': manifest({ skills: [] }),
  });
  const plugins = loadPlugins(root);
  const cfg = (y) => parseConfig(`version: 1\nplugins:\n${y}`).config;
  assert.deepEqual(checkPluginConfig(cfg('  tracker:\n    enabled: true\n    approved_destinations:\n      - api.tracker.example\n'), plugins), []);
  assert.match(checkPluginConfig(cfg('  tracker:\n    enabled: true\n'), plugins)[0].message, /declared but not approved/);
  assert.match(checkPluginConfig(cfg('  tracker:\n    enabled: true\n    approved_destinations:\n      - evil.example\n'), plugins).map((p) => p.message).join(), /not declared/);
  assert.match(checkPluginConfig(cfg('  ghost:\n    enabled: true\n'), plugins)[0].message, /no manifest/);
});

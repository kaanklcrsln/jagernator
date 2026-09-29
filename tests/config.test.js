import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, YamlError } from '../src/config/yaml.js';
import { parseConfig, renderConfig } from '../src/config/index.js';
import { CORE_SKILLS } from '../src/config/schema.js';

test('yaml: mappings, sequences, scalars, comments, flow lists', () => {
  const v = parseYaml(`
a: 1   # comment
b: "x # not comment"
c:
  - one
  - 'two'
d: [x, y]
e: {}
f:
  g: true
  h: null
list:
  - name: n
    v: 2
`);
  assert.deepEqual(v, { a: 1, b: 'x # not comment', c: ['one', 'two'], d: ['x', 'y'], e: {}, f: { g: true, h: null }, list: [{ name: 'n', v: 2 }] });
});

test('yaml: rejects tabs, duplicates, anchors, bad indentation', () => {
  assert.throws(() => parseYaml('a:\n\t- x'), YamlError);
  assert.throws(() => parseYaml('a: 1\na: 2'), /duplicate key/);
  assert.throws(() => parseYaml('a: &x 1'), /anchors/);
  assert.throws(() => parseYaml('a: 1\n   b: 2'), /indentation/);
});

test('config: generated template parses and validates', () => {
  const { config, errors } = parseConfig(renderConfig({ agents: ['claude', 'codex'], allowedDestinations: ['registry.npmjs.org'] }));
  assert.deepEqual(errors, []);
  assert.deepEqual(config.agents, ['claude', 'codex']);
  assert.deepEqual(config.skills.enabled, CORE_SKILLS);
  assert.equal(config.security.network, 'deny-by-default');
  assert.deepEqual(config.security.allowed_destinations, ['registry.npmjs.org']);
  assert.equal(config.context.avoid_duplicate_reads, true);
});

test('config: minimal config gets safe defaults', () => {
  const { config, errors } = parseConfig('version: 1\n');
  assert.deepEqual(errors, []);
  assert.equal(config.security.network, 'deny-by-default');
  assert.equal(config.security.external_source_upload, 'deny');
  assert.equal(config.security.secret_detection, 'enabled');
  assert.deepEqual(config.security.allowed_destinations, []);
  assert.equal(config.enforcement.claude_hooks, true);
});

test('config: reports unknown keys, bad enums, bad types, bad hosts', () => {
  const { config, errors } = parseConfig(`version: 1
agents: [claude, copilot]
security:
  network: allow-all
  allowed_destinations:
    - "https://x.com"
context:
  large_file_bytes: small
bogus: 1
`);
  assert.equal(config, null);
  const all = errors.join('\n');
  assert.match(all, /agents\[1\]: must be one of/);
  assert.match(all, /security\.network: must be one of/);
  assert.match(all, /allowed_destinations\[0\].*not a hostname/);
  assert.match(all, /large_file_bytes: expected an integer/);
  assert.match(all, /bogus: unknown key/);
});

test('config: missing version and YAML errors are reported, not thrown', () => {
  assert.match(parseConfig('profile: senior-engineer\n').errors.join(), /version: is required/);
  assert.match(parseConfig('a: [\n').errors.join(), /YAML/);
  assert.match(parseConfig('- a\n').errors.join(), /must be a mapping/);
});

test('config: plugins map validates entries', () => {
  const { errors } = parseConfig('version: 1\nplugins:\n  Bad_Name:\n    enabled: yes\n');
  assert.match(errors.join('\n'), /invalid key "Bad_Name"/);
  assert.match(errors.join('\n'), /enabled: expected true or false/);
});

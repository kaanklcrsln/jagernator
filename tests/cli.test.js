import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cli, read, tmpProject, git, REPO } from './helpers.js';

const snapshot = (dir) => {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.name === '.git' || p.includes(`${path.sep}state${path.sep}`) || p.includes(`${path.sep}logs${path.sep}`)) continue;
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
};

test('version and help', () => {
  const pkg = JSON.parse(read(REPO, 'package.json'));
  assert.equal(cli(REPO, ['version']).out.trim(), `jagernator ${pkg.version}`);
  assert.match(cli(REPO, ['help']).out, /jagernator <command>/);
  assert.equal(cli(REPO, ['bogus']).code, 1);
});

test('init: creates config, policies, skills and adapters; detects project', () => {
  const dir = tmpProject({ 'package.json': JSON.stringify({ scripts: { test: 'node --test' } }), 'CLAUDE.md': '# Team notes\n\nkeep me\n' });
  const r = cli(dir, ['init']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Detected agents: claude/);
  assert.match(r.out, /Allowlisting package registries: registry.npmjs.org/);
  for (const f of ['.jagernator/config.yaml', '.jagernator/policies/engineering.md', '.jagernator/skills/network-safety/SKILL.md', '.jagernator/INSTRUCTIONS.md',
    '.claude/skills/jagernator-debugging/SKILL.md', '.claude/settings.json', '.jagernatorignore', '.jagernator/.gitignore', '.jagernator/manifest.json']) {
    assert.ok(fs.existsSync(path.join(dir, f)), f);
  }
  const md = read(dir, 'CLAUDE.md');
  assert.match(md, /^# Team notes\n\nkeep me\n/);
  assert.match(md, /`npm test`/);
  assert.equal(fs.existsSync(path.join(dir, 'AGENTS.md')), false, 'codex not detected → no AGENTS.md');
});

test('init is idempotent', () => {
  const dir = tmpProject({ 'package.json': '{}', 'AGENTS.md': 'codex notes\n' });
  cli(dir, ['init']);
  const first = snapshot(dir);
  const r = cli(dir, ['init']);
  assert.match(r.out, /0 created, 0 updated, 0 removed/);
  assert.deepEqual(snapshot(dir), first);
  assert.equal(read(dir, 'AGENTS.md').split('<!-- jagernator:begin -->').length, 2);
});

test('init preserves an existing config and refuses to touch an invalid one', () => {
  const dir = tmpProject({ '.jagernator/config.yaml': 'version: 1\nagents: [codex]\n# my comment\n' });
  assert.equal(cli(dir, ['init', '--agents', 'claude']).code, 0);
  assert.equal(read(dir, '.jagernator/config.yaml'), 'version: 1\nagents: [codex]\n# my comment\n');
  assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')));
  assert.equal(fs.existsSync(path.join(dir, 'CLAUDE.md')), false);
  fs.writeFileSync(path.join(dir, '.jagernator/config.yaml'), 'version: 1\nagents: [nope]\n');
  const bad = cli(dir, ['init']);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /agents\[0\]: must be one of/);
  assert.equal(read(dir, '.jagernator/config.yaml'), 'version: 1\nagents: [nope]\n');
});

test('init rejects unknown agents', () => {
  const r = cli(tmpProject(), ['init', '--agents', 'claude,copilot']);
  assert.equal(r.code, 1);
  assert.match(r.err, /Unknown agent\(s\): copilot/);
});

test('update: keeps local edits, removes disabled skills, --force overwrites', () => {
  const dir = tmpProject();
  cli(dir, ['init', '--agents', 'claude']);
  const edited = '.jagernator/skills/git/SKILL.md';
  fs.appendFileSync(path.join(dir, edited), '\nTeam rule: squash merges.\n');
  let r = cli(dir, ['update']);
  assert.match(r.out, /! \.jagernator\/skills\/git\/SKILL\.md: modified locally/);
  assert.match(read(dir, edited), /Team rule/);
  assert.match(read(dir, '.claude/skills/jagernator-git/SKILL.md'), /Team rule/, 'adapters use the project copy');
  const cfg = read(dir, '.jagernator/config.yaml').replace('    - refactoring\n', '');
  fs.writeFileSync(path.join(dir, '.jagernator/config.yaml'), cfg);
  r = cli(dir, ['update']);
  assert.match(r.out, /- \.claude\/skills\/jagernator-refactoring\/SKILL\.md/);
  assert.equal(fs.existsSync(path.join(dir, '.jagernator/skills/refactoring')), false);
  r = cli(dir, ['update', '--force']);
  assert.doesNotMatch(read(dir, edited), /Team rule/);
});

test('update: removing an agent removes its managed block and hooks but keeps user content', () => {
  const dir = tmpProject({ 'CLAUDE.md': '# Mine\n' });
  cli(dir, ['init', '--agents', 'claude']);
  fs.writeFileSync(path.join(dir, '.jagernator/config.yaml'), read(dir, '.jagernator/config.yaml').replace('  - claude\n', '  - codex\n'));
  cli(dir, ['update']);
  assert.equal(read(dir, 'CLAUDE.md'), '# Mine\n');
  assert.deepEqual(JSON.parse(read(dir, '.claude/settings.json')), {});
  assert.equal(fs.existsSync(path.join(dir, '.claude/skills/jagernator-git')), false);
  assert.ok(read(dir, 'AGENTS.md').includes('jagernator:begin'));
});

test('init does not corrupt invalid .claude/settings.json', () => {
  const dir = tmpProject({ '.claude/settings.json': '{ broken' });
  const r = cli(dir, ['init']);
  assert.match(r.out, /\.claude\/settings\.json: not valid JSON/);
  assert.equal(read(dir, '.claude/settings.json'), '{ broken');
});

test('update outside a project fails with guidance', () => {
  const r = cli(tmpProject(), ['update']);
  assert.equal(r.code, 1);
  assert.match(r.err, /jagernator init/);
});

test('doctor: healthy install, then actionable errors', () => {
  const dir = tmpProject();
  git(dir, 'init', '-q');
  cli(dir, ['init', '--agents', 'claude,codex']);
  const binDir = fs.mkdtempSync(path.join(dir, 'bin-'));
  fs.symlinkSync(path.join(REPO, 'bin/jagernator.js'), path.join(binDir, 'jagernator'));
  const env = { PATH: `${binDir}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin` };
  let r = cli(dir, ['doctor'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /hooks installed and `jagernator` is on PATH/);
  assert.match(r.out, /Codex has no Jagernator hooks/);

  r = cli(dir, ['doctor']);
  assert.equal(r.code, 1);
  assert.match(r.out, /not on PATH/);

  fs.writeFileSync(path.join(dir, '.env'), 'X=1');
  git(dir, 'add', '-f', '.env');
  fs.rmSync(path.join(dir, '.jagernator/skills/debugging'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { drive: {} } }));
  r = cli(dir, ['doctor'], { env });
  assert.match(r.out, /enabled skill "debugging" is not installed/);
  assert.match(r.out, /credential file\(s\) tracked by git: \.env/);
  assert.match(r.out, /MCP server "drive"/);
  assert.match(r.out, /managed file\(s\) missing/);
  assert.match(r.out, /fix: run `jagernator update`/);

  fs.writeFileSync(path.join(dir, '.jagernator/config.yaml'), 'version: 1\nsecurity:\n  network: open\n');
  r = cli(dir, ['doctor'], { env });
  assert.equal(r.code, 1);
  assert.match(r.out, /security\.network: must be one of/);
});

test('doctor without a project', () => {
  const r = cli(tmpProject(), ['doctor']);
  assert.equal(r.code, 1);
  assert.match(r.out, /config.yaml not found/);
});

test('skills list and selective show', () => {
  const dir = tmpProject();
  cli(dir, ['init', '--agents', 'generic']);
  const list = cli(dir, ['skills']).out;
  assert.equal(list.trim().split('\n').length, 9);
  assert.doesNotMatch(list, /## /, 'listing shows metadata, not bodies');
  assert.match(cli(dir, ['skills', 'show', 'debugging']).out, /# Debugging/);
  assert.match(cli(dir, ['skills', 'show', 'network-safety', 'data-classification.md']).out, /# Data classification/);
  assert.equal(cli(dir, ['skills', 'show', 'nope']).code, 1);
});

test('check, scan and redact commands', () => {
  const dir = tmpProject();
  cli(dir, ['init', '--agents', 'generic']);
  const deny = cli(dir, ['check', 'shell', 'curl https://example.com']);
  assert.equal(deny.code, 2);
  assert.match(deny.out, /^DENY/);
  assert.equal(cli(dir, ['check', 'read', 'src/app.js']).code, 0);
  const token = 'ghp_' + 'Z9'.repeat(18);
  fs.writeFileSync(path.join(dir, 'leak.txt'), `ok\ntoken=${token}\n`);
  const scan = cli(dir, ['scan', 'leak.txt']);
  assert.equal(scan.code, 1);
  assert.equal(scan.out.trim(), 'leak.txt:2: github-token (high confidence)');
  assert.equal(cli(dir, ['redact'], { input: `x ${token} y` }).out, 'x [REDACTED:github-token] y');
});

test('task and verify commands', () => {
  const dir = tmpProject();
  git(dir, 'init', '-q');
  cli(dir, ['init', '--agents', 'generic']);
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'init');
  assert.equal(cli(dir, ['task', 'start', 'add feature']).code, 0);
  assert.equal(cli(dir, ['task', 'complete']).code, 1);
  cli(dir, ['task', 'note', 'plan', '1. do it']);
  assert.equal(cli(dir, ['verify', '--', 'node', '-e', 'process.exit(3)']).code, 3);
  const again = cli(dir, ['verify', '--', 'node', '-e', 'process.exit(3)']);
  assert.match(again.out, /Same check already failed on this exact workspace/);
  assert.equal(cli(dir, ['verify', '--', 'node', '-e', '0']).code, 0);
  assert.match(cli(dir, ['task', 'show']).out, /diff review/);
  assert.equal(cli(dir, ['task', 'phase', 'review']).code, 0);
  const done = cli(dir, ['task', 'complete']);
  assert.equal(done.code, 0, done.out);
  assert.match(done.out, /Task complete/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { adapters, claudeHooksInstalled, mergeClaudeSettings, HOOK_COMMAND } from '../src/adapters/index.js';
import { BEGIN, END, renderInstructions, upsertBlock } from '../src/adapters/instructions.js';
import { parseConfig } from '../src/config/index.js';
import { discoverSkills } from '../src/skills/registry.js';
import path from 'node:path';
import { REPO } from './helpers.js';

const config = (extra = '') => parseConfig(`version: 1\n${extra}`).config;
const skills = discoverSkills(path.join(REPO, 'skills')).map((s) => ({ ...s, path: `.jagernator/skills/${s.name}/SKILL.md` }));
const ctx = (extra) => ({ config: config(extra), project: { commands: ['npm test'], technologies: ['node'] }, skills, destinations: ['registry.npmjs.org'] });

test('managed block: insert, replace, preserve surrounding content', () => {
  const first = upsertBlock('# Mine\n\nkeep', 'v1\n');
  assert.match(first, /^# Mine\n\nkeep\n\n<!-- jagernator:begin -->/);
  const second = upsertBlock(`${first}\nafter\n`, 'v2\n');
  assert.equal(second.split(BEGIN).length, 2, 'exactly one block');
  assert.match(second, /v2/);
  assert.doesNotMatch(second, /v1/);
  assert.match(second, /keep/);
  assert.match(second, /after/);
  assert.equal(upsertBlock(second, 'v2\n'), second, 'idempotent');
  assert.ok(upsertBlock(null, 'x\n').startsWith(BEGIN) && upsertBlock(null, 'x\n').trim().endsWith(END));
});

test('claude adapter: CLAUDE.md block, prefixed skills, hooks', () => {
  const ops = adapters.claude(ctx());
  const block = ops.find((o) => o.type === 'block');
  assert.equal(block.path, 'CLAUDE.md');
  assert.match(block.body, /## 1\. Think Before Coding/);
  assert.match(block.body, /Jagernator hooks check every tool call/);
  assert.match(block.body, /`npm test`/);
  assert.match(block.body, /`registry.npmjs.org`/);
  assert.doesNotMatch(block.body, /\.jagernator\/skills\/debugging/, 'claude discovers skills natively; no index needed');
  const skill = ops.find((o) => o.path === '.claude/skills/jagernator-debugging/SKILL.md');
  assert.match(skill.content, /^---\nname: jagernator-debugging\n/);
  assert.ok(ops.some((o) => o.path === '.claude/skills/jagernator-security/references/secret-patterns.md'));
  const settings = ops.find((o) => o.type === 'json').merge({});
  assert.equal(claudeHooksInstalled(settings), true);
});

test('claude adapter without hooks says rules are guidance', () => {
  const block = adapters.claude(ctx('enforcement:\n  claude_hooks: false\n')).find((o) => o.type === 'block');
  assert.match(block.body, /guidance; Jagernator cannot technically enforce/);
  assert.equal(claudeHooksInstalled(adapters.claude(ctx('enforcement:\n  claude_hooks: false\n')).find((o) => o.type === 'json').merge({})), false);
});

test('codex adapter: AGENTS.md block with on-demand skill index', () => {
  const [op] = adapters.codex(ctx());
  assert.equal(op.path, 'AGENTS.md');
  assert.match(op.body, /guidance; Jagernator cannot technically enforce/);
  assert.match(op.body, /- `debugging`: .* → `\.jagernator\/skills\/debugging\/SKILL\.md`/);
  assert.doesNotMatch(op.body, /## Loop/, 'skill bodies are not inlined');
});

test('generic adapter: standalone instructions file', () => {
  const [op] = adapters.generic(ctx());
  assert.equal(op.path, '.jagernator/INSTRUCTIONS.md');
  assert.equal(op.type, 'file');
  assert.match(op.content, /^# Jagernator/);
  assert.match(op.content, /network-safety/);
});

test('instructions stay compact', () => {
  for (const agent of ['claude', 'codex']) {
    const body = renderInstructions({ ...ctx(), agent });
    assert.ok(body.length < 8000, `${agent} block is ${body.length} chars`);
  }
});

test('settings merge preserves user hooks and is idempotent', () => {
  const user = { permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] }] } };
  const once = mergeClaudeSettings(user, true);
  const twice = mergeClaudeSettings(once, true);
  assert.deepEqual(twice, once);
  assert.deepEqual(once.permissions, user.permissions);
  assert.equal(once.hooks.PreToolUse[0].hooks[0].command, 'echo mine');
  assert.equal(JSON.stringify(once).split(HOOK_COMMAND).length - 1, 3);
  const removed = mergeClaudeSettings(once, false);
  assert.deepEqual(removed, user);
  assert.deepEqual(mergeClaudeSettings({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: HOOK_COMMAND }] }] } }, false), {});
});

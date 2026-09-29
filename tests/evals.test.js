import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseClaudeStream } from '../evals/transcript.js';
import { summarize } from '../evals/run.js';
import { REPO } from './helpers.js';

const RUN = path.join(REPO, 'evals/run.js');

test('eval scenarios self-test: hidden checks fail on fixtures and pass on references', () => {
  const r = spawnSync(process.execPath, [RUN, '--self-test'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim().split('\n').length, 9);
});

test('transcript parser: duplicate reads, repeated commands, network attempts, usage', () => {
  const t = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'curl https://x.io' } }] } },
    { type: 'result', usage: { input_tokens: 5, output_tokens: 7 } },
  ].map((e) => JSON.stringify(e)).join('\n');
  const m = parseClaudeStream(t);
  assert.equal(m.duplicateReads, 1);
  assert.equal(m.networkAttempts, 1);
  assert.deepEqual(m.usage, { input_tokens: 5, output_tokens: 7 });
  assert.equal(parseClaudeStream('plain text output').parsed, false);
});

test('eval runner end-to-end with a fake agent (baseline vs jagernator)', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'jagernator-evalout-'));
  const agent = `"${process.execPath}" "${path.join(REPO, 'tests/fixtures/fake-agent.js')}"`;
  const env = { ...process.env, FAKE_AGENT_REFERENCE: path.join(REPO, 'evals/scenarios/bug-fix/reference') };
  const r = spawnSync(process.execPath, [RUN, '--agent', agent, '--scenario', 'bug-fix', '--mode', 'both', '--out', out], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  const base = JSON.parse(fs.readFileSync(path.join(out, 'bug-fix.baseline.1.json'), 'utf8'));
  const jag = JSON.parse(fs.readFileSync(path.join(out, 'bug-fix.jagernator.1.json'), 'utf8'));
  for (const res of [base, jag]) {
    assert.equal(res.success, true);
    assert.deepEqual(res.unrelatedChanges, []);
    assert.equal(res.transcript.duplicateReads, 1);
    assert.equal(res.transcript.repeatedCommands, 1);
    assert.equal(res.transcript.networkAttempts, 1);
    assert.equal(res.transcript.usage.input_tokens, 1200);
  }
  assert.match(fs.readFileSync(path.join(out, 'SUMMARY.md'), 'utf8'), /\| bug-fix \| jagernator \| 1 \| 1\/1 \|/);
});

test('eval runner detects canary leaks and unrelated changes', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'jagernator-evalout-'));
  const agent = `"${process.execPath}" "${path.join(REPO, 'tests/fixtures/fake-agent.js')}"`;
  const env = { ...process.env, FAKE_AGENT_LEAK: 'token is JGN_CANARY_7f3a9c21e4' };
  spawnSync(process.execPath, [RUN, '--agent', agent, '--scenario', 'secret-exposure', '--mode', 'baseline', '--out', out], { encoding: 'utf8', env });
  const res = JSON.parse(fs.readFileSync(path.join(out, 'secret-exposure.baseline.1.json'), 'utf8'));
  assert.equal(res.checks['no-canary-leak'], false);
  assert.equal(res.checks['no-network'], false);
  assert.equal(res.success, false);
  assert.deepEqual(res.unrelatedChanges, ['notes.txt']);
});

test('summary reports n/a for unmeasured values instead of inventing them', () => {
  const s = summarize([{ scenario: 'x', mode: 'baseline', success: true, unrelatedChanges: [], jagernator: { duplicateReadsBlocked: 0, blockedSecretOrNetwork: 0, asked: 0 }, transcript: { parsed: false } }]);
  assert.match(s, /\| x \| baseline \| 1 \| 1\/1 \| 0\.0 \| n\/a \| n\/a \|/);
});

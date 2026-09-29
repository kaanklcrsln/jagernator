import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as wf from '../src/core/workflow.js';
import { parseConfig } from '../src/config/index.js';
import { FAKE, git, tmpProject } from './helpers.js';

const config = parseConfig('version: 1\n').config;

function repo() {
  const root = tmpProject({ '.jagernator/.gitignore': 'state/\nlogs/\n', 'a.js': 'x' });
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  return root;
}

test('phase transitions follow the lifecycle', () => {
  const root = repo();
  wf.startTask(root, 'fix bug');
  assert.throws(() => wf.startTask(root, 'another'), /already active/);
  assert.throws(() => wf.setPhase(root, 'implement'), /Cannot move from understand to implement/);
  for (const p of ['explore', 'plan', 'implement', 'verify', 'diagnose', 'replan', 'implement', 'verify', 'review']) wf.setPhase(root, p);
  assert.throws(() => wf.setPhase(root, 'complete'), /task complete/);
  assert.throws(() => wf.setPhase(root, 'nope'), /Unknown phase/);
});

test('blind retry: same command failing on an unchanged workspace is flagged', () => {
  const root = repo();
  assert.equal(wf.recordVerification(root, { command: 'npm test', exitCode: 1 }).blindRetry, false);
  assert.equal(wf.recordVerification(root, { command: 'npm test', exitCode: 1 }).blindRetry, true);
  fs.writeFileSync(path.join(root, 'a.js'), 'changed');
  assert.equal(wf.recordVerification(root, { command: 'npm test', exitCode: 1 }).blindRetry, false);
  assert.equal(wf.recordVerification(root, { command: 'npm run lint', exitCode: 1 }).blindRetry, false);
});

test('state writes do not change the workspace fingerprint', () => {
  const root = repo();
  const before = wf.workspaceFingerprint(root);
  wf.startTask(root, 'x');
  assert.equal(wf.workspaceFingerprint(root), before);
});

test('completion gates: plan, passing verification on current workspace, review after verify', () => {
  const root = repo();
  wf.startTask(root, 'feature');
  let r = wf.completeTask(root, config);
  assert.equal(r.completed, false);
  assert.equal(r.gaps.length, 3);
  wf.addNote(root, 'plan', '1. add fn → verify: test');
  wf.recordVerification(root, { command: 'npm test', exitCode: 1 });
  assert.match(wf.completionGaps(root, config).join(), /last check failed/);
  wf.recordVerification(root, { command: 'npm test', exitCode: 0 });
  fs.writeFileSync(path.join(root, 'a.js'), 'edited after test');
  assert.match(wf.completionGaps(root, config).join(), /workspace changed/);
  wf.recordVerification(root, { command: 'npm test', exitCode: 0 });
  wf.setPhase(root, 'review');
  assert.deepEqual(wf.completionGaps(root, config), []);
  r = wf.completeTask(root, config);
  assert.equal(r.completed, true);
  assert.throws(() => wf.addNote(root, 'decision', 'x'), /No active task/);
});

test('optional gates and honest override', () => {
  const root = repo();
  const relaxed = parseConfig('version: 1\nworkflow:\n  planning: optional\n  verification: optional\n  diff_review: optional\n').config;
  wf.startTask(root, 'tiny');
  assert.deepEqual(wf.completionGaps(root, relaxed), []);
  const r = wf.completeTask(root, config, { unverifiedReason: 'no test runner in repo' });
  assert.equal(r.completed, true);
  assert.equal(wf.loadState(root).task.completedWithGaps.reason, 'no test runner in repo');
});

test('notes are redacted and repeated failures flagged', () => {
  const root = repo();
  wf.startTask(root, `use ${FAKE.github}`);
  assert.equal(wf.addNote(root, 'failure', 'null deref in parse').repeated, false);
  assert.equal(wf.addNote(root, 'failure', 'null deref in parse').repeated, true);
  assert.throws(() => wf.addNote(root, 'mood', 'x'), /Unknown note kind/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, '.jagernator/state/task.json'), 'utf8'), /ghp_/);
});

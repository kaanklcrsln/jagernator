// Harness lifecycle: explicit phases, recorded verification, blind-retry detection,
// and completion gates. State is metadata only (.jagernator/state/task.json).
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readJson, sanitize, stateDir, writeJson } from '../state/store.js';

export class WorkflowError extends Error {}

export const PHASES = ['understand', 'explore', 'plan', 'implement', 'verify', 'diagnose', 'replan', 'review', 'complete'];
export const TRANSITIONS = {
  understand: ['explore', 'plan'],
  explore: ['understand', 'plan'],
  plan: ['explore', 'implement'],
  implement: ['verify'],
  verify: ['review', 'diagnose'],
  diagnose: ['explore', 'replan'],
  replan: ['implement'],
  review: ['implement', 'complete'],
  complete: [],
};
export const NOTE_KINDS = ['plan', 'assumption', 'decision', 'failure'];
const MAX_VERIFICATIONS = 50;

const file = (root) => path.join(stateDir(root), 'task.json');
const now = () => new Date().toISOString();

export function loadState(root) {
  return readJson(file(root), { task: null, verifications: [] });
}
const save = (root, state) => writeJson(file(root), state);

/** Hash of the working tree relative to HEAD (tracked diff + untracked names). null outside git. */
export function workspaceFingerprint(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  try {
    const diff = git('diff', 'HEAD', '--no-ext-diff', '--binary');
    const untracked = git('ls-files', '--others', '--exclude-standard', '-z');
    return crypto.createHash('sha256').update(diff).update('\0').update(untracked).digest('hex').slice(0, 16);
  } catch {
    try {
      // Repository without commits yet.
      const status = git('status', '--porcelain', '-z');
      return crypto.createHash('sha256').update(status).digest('hex').slice(0, 16);
    } catch {
      return null;
    }
  }
}

function requireTask(state) {
  if (!state.task || state.task.phase === 'complete') throw new WorkflowError('No active task. Start one with: jagernator task start "<goal>"');
  return state.task;
}

export function startTask(root, goal) {
  const state = loadState(root);
  if (state.task && state.task.phase !== 'complete') throw new WorkflowError(`Task already active: "${state.task.goal}". Complete it first (jagernator task complete).`);
  state.task = { goal: sanitize(goal), phase: 'understand', started: now(), updated: now(), history: [{ phase: 'understand', ts: now() }], notes: [] };
  save(root, state);
  return state.task;
}

export function addNote(root, kind, text) {
  if (!NOTE_KINDS.includes(kind)) throw new WorkflowError(`Unknown note kind "${kind}". Use one of: ${NOTE_KINDS.join(', ')}`);
  const state = loadState(root);
  const task = requireTask(state);
  const note = { kind, text: sanitize(text), phase: task.phase, ts: now() };
  const repeated = kind === 'failure' && task.notes.some((n) => n.kind === 'failure' && n.text === note.text);
  task.notes.push(note);
  task.updated = now();
  save(root, state);
  return { note, repeated };
}

export function setPhase(root, phase) {
  if (!PHASES.includes(phase)) throw new WorkflowError(`Unknown phase "${phase}". Phases: ${PHASES.join(', ')}`);
  const state = loadState(root);
  const task = requireTask(state);
  if (phase === 'complete') throw new WorkflowError('Use `jagernator task complete` to finish a task (it checks the completion gates).');
  if (phase !== task.phase && !TRANSITIONS[task.phase].includes(phase)) {
    throw new WorkflowError(`Cannot move from ${task.phase} to ${phase}. Allowed: ${TRANSITIONS[task.phase].join(', ') || 'none'}`);
  }
  task.phase = phase;
  task.history.push({ phase, ts: now() });
  task.updated = now();
  save(root, state);
  return task;
}

/**
 * Record a verification result. Returns { record, blindRetry } where blindRetry is true
 * when the same command already failed on an identical workspace.
 */
export function recordVerification(root, { command, exitCode, durationMs }) {
  const state = loadState(root);
  const fingerprint = workspaceFingerprint(root);
  const record = { command: sanitize(command), exitCode, passed: exitCode === 0, durationMs, fingerprint, ts: now() };
  const blindRetry = !record.passed && fingerprint !== null &&
    state.verifications.some((v) => v.command === record.command && !v.passed && v.fingerprint === fingerprint);
  state.verifications = [...state.verifications, record].slice(-MAX_VERIFICATIONS);
  const task = state.task && state.task.phase !== 'complete' ? state.task : null;
  if (task) {
    if (task.phase !== 'verify') task.history.push({ phase: 'verify', ts: now() });
    task.phase = record.passed ? 'verify' : 'diagnose';
    if (!record.passed) task.history.push({ phase: 'diagnose', ts: now() });
    task.updated = now();
  }
  save(root, state);
  return { record, blindRetry };
}

/** Completion gates from config.workflow. Returns a list of unmet requirements. */
export function completionGaps(root, config, state = loadState(root)) {
  const task = requireTask(state);
  const gaps = [];
  if (config.workflow.planning === 'required' && !task.notes.some((n) => n.kind === 'plan') && !task.history.some((h) => h.phase === 'plan')) {
    gaps.push('planning: no plan recorded (jagernator task note plan "..." or task phase plan)');
  }
  const verifications = state.verifications.filter((v) => v.ts >= task.started);
  const last = verifications[verifications.length - 1];
  if (config.workflow.verification === 'required') {
    if (!last) gaps.push('verification: no check recorded for this task (jagernator verify -- <command>)');
    else if (!last.passed) gaps.push(`verification: last check failed (${last.command}, exit ${last.exitCode})`);
    else if (last.fingerprint && last.fingerprint !== workspaceFingerprint(root)) gaps.push('verification: workspace changed after the last passing check; rerun it');
  }
  if (config.workflow.diff_review === 'required') {
    const reviewed = task.history.some((h) => h.phase === 'review' && (!last || h.ts >= last.ts));
    if (!reviewed) gaps.push('diff review: review the final diff after the last check, then: jagernator task phase review');
  }
  return gaps;
}

export function completeTask(root, config, { unverifiedReason } = {}) {
  const state = loadState(root);
  const task = requireTask(state);
  const gaps = completionGaps(root, config, state);
  if (gaps.length && !unverifiedReason) return { completed: false, gaps };
  task.phase = 'complete';
  task.history.push({ phase: 'complete', ts: now() });
  if (gaps.length) task.completedWithGaps = { gaps, reason: sanitize(unverifiedReason) };
  task.updated = now();
  save(root, state);
  return { completed: true, gaps };
}

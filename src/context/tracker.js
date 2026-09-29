// Per-session read metadata: path, content hash, line ranges read. Never file contents.
// Used to deny rereads of unchanged ranges and to report (estimated) context usage.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readJson, stateDir, writeJson } from '../state/store.js';

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
export const CHARS_PER_TOKEN_ESTIMATE = 4;

const sessionsDir = (root) => path.join(stateDir(root), 'context');
const safeId = (id) => String(id || 'default').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);

export function hashContent(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/** Merge [start, end] line ranges (1-based, inclusive). */
export function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

export const covered = (ranges, [start, end]) => ranges.some(([a, b]) => a <= start && end <= b);
const fmt = (ranges) => ranges.map(([a, b]) => `${a}-${b}`).join(', ');

function emptySession(id) {
  const now = new Date().toISOString();
  return { session: id, started: now, updated: now, files: {}, stats: { reads: 0, bytesRead: 0, duplicateReadsBlocked: 0, largeReadsBlocked: 0 } };
}

export class ContextTracker {
  constructor(root, sessionId) {
    this.root = root;
    this.id = safeId(sessionId);
    this.file = path.join(sessionsDir(root), `${this.id}.json`);
    this.data = readJson(this.file, null) || emptySession(this.id);
  }

  rel(p) {
    return path.relative(this.root, path.resolve(this.root, p)).split(path.sep).join('/');
  }

  /** Current content snapshot or null if unreadable. */
  snapshot(p) {
    try {
      const buf = fs.readFileSync(path.resolve(this.root, p));
      const text = buf.toString('utf8');
      return { hash: hashContent(buf), size: buf.length, lines: text.split('\n'), text };
    } catch {
      return null;
    }
  }

  /** Requested line range, resolved against the file's line count. */
  static range(offset, limit, lineCount) {
    const start = Math.max(offset || 1, 1);
    const end = Math.min(limit ? start + limit - 1 : lineCount, lineCount);
    return [start, Math.max(end, start)];
  }

  /**
   * Check a prospective read. `defaultLimit` is the agent's own cap for reads without a limit.
   * Returns { duplicate, changed, range, previous }.
   */
  checkRead(p, { offset, limit, defaultLimit } = {}) {
    const entry = this.data.files[this.rel(p)];
    const snap = this.snapshot(p);
    if (!entry || !snap) return { duplicate: false, changed: false };
    const range = ContextTracker.range(offset, limit || defaultLimit, snap.lines.length);
    const changed = entry.hash !== snap.hash;
    return { duplicate: !changed && covered(entry.ranges, range), changed, range, previous: fmt(entry.ranges), lastRead: entry.lastRead };
  }

  recordRead(p, { offset, limit, defaultLimit } = {}) {
    const snap = this.snapshot(p);
    if (!snap) return;
    const key = this.rel(p);
    const range = ContextTracker.range(offset, limit || defaultLimit, snap.lines.length);
    const prev = this.data.files[key];
    const ranges = prev && prev.hash === snap.hash ? [...prev.ranges, range] : [range];
    this.data.files[key] = {
      hash: snap.hash,
      size: snap.size,
      ranges: mergeRanges(ranges),
      reads: (prev?.reads || 0) + 1,
      lastRead: new Date().toISOString(),
    };
    this.data.stats.reads++;
    this.data.stats.bytesRead += Buffer.byteLength(snap.lines.slice(range[0] - 1, range[1]).join('\n'));
  }

  bump(stat) {
    this.data.stats[stat] = (this.data.stats[stat] || 0) + 1;
  }

  save() {
    this.data.updated = new Date().toISOString();
    writeJson(this.file, this.data);
  }

  /** Forget reads for this session (after context compaction the agent no longer holds them). */
  reset() {
    this.data = emptySession(this.id);
    this.save();
    pruneSessions(this.root);
  }
}

export function pruneSessions(root, now = Date.now()) {
  const dir = sessionsDir(root);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const file = path.join(dir, f);
    try {
      if (now - fs.statSync(file).mtimeMs > SESSION_TTL_MS) fs.unlinkSync(file);
    } catch {
      /* raced with another process */
    }
  }
}

/** Sessions sorted newest first. */
export function listSessions(root) {
  const dir = sessionsDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(dir, f), null))
    .filter(Boolean)
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

export const estimateTokens = (bytes) => Math.ceil(bytes / CHARS_PER_TOKEN_ESTIMATE);

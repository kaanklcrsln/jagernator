import fs from 'node:fs';
import path from 'node:path';
import { JAG_DIR } from '../config/index.js';
import { redact } from '../security/secrets.js';

export const stateDir = (root) => path.join(root, JAG_DIR, 'state');
export const logDir = (root) => path.join(root, JAG_DIR, 'logs');

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`Corrupt Jagernator state file ${file}: ${err.message}`);
  }
}

/** Atomic write (tmp + rename) so concurrent hook processes never see partial JSON. */
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

const MAX_FIELD = 300;
const MAX_LOG_BYTES = 1024 * 1024;

/** Redact secrets and truncate long strings, recursively. */
export function sanitize(value) {
  if (typeof value === 'string') {
    const clean = redact(value);
    return clean.length > MAX_FIELD ? `${clean.slice(0, MAX_FIELD)}…[truncated]` : clean;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
  return value;
}

/** Append a sanitized event to .jagernator/logs/events.jsonl (rotated at 1 MB). */
export function logEvent(root, event) {
  const dir = logDir(root);
  const file = path.join(dir, 'events.jsonl');
  fs.mkdirSync(dir, { recursive: true });
  try {
    if (fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, path.join(dir, 'events.1.jsonl'));
  } catch {
    /* no log yet */
  }
  fs.appendFileSync(file, JSON.stringify(sanitize({ ts: new Date().toISOString(), ...event })) + '\n');
}

// Idempotent installation of policies, skills and adapter files.
// - Files Jagernator owns are hash-tracked in .jagernator/manifest.json; a file the
//   user edited is never overwritten (unless --force) and is reported instead.
// - User-owned files (CLAUDE.md, AGENTS.md, .claude/settings.json) only get a
//   managed block / merged entries; everything else in them is preserved.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JAG_DIR } from '../config/index.js';
import { adapters, mergeClaudeSettings } from '../adapters/index.js';
import { BEGIN, END, upsertBlock } from '../adapters/instructions.js';
import { PKG_ROOT } from '../paths.js';
import { DEFAULT_IGNORE, IGNORE_FILE } from '../security/ignore.js';
import { createNetworkPolicy } from '../security/network.js';
import { discoverSkills } from '../skills/registry.js';
import { loadPlugins } from '../plugins/index.js';
import { readJson, writeJson } from '../state/store.js';
import { detectProject } from './detect.js';

export const manifestPath = (root) => path.join(root, JAG_DIR, 'manifest.json');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const JSON_REMOVERS = { '.claude/settings.json': (s) => mergeClaudeSettings(s, false) };

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

function removeEmptyDirs(root, rel) {
  let dir = path.dirname(path.join(root, rel));
  while (dir.startsWith(root) && dir !== root) {
    try {
      fs.rmdirSync(dir); // only succeeds when empty
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

/** Enabled skills available to adapters: installed core/custom skills + enabled plugin skills. */
export function collectSkills(root, config, plugins) {
  const enabled = new Set(config.skills.enabled);
  const skills = discoverSkills(path.join(root, JAG_DIR, 'skills')).filter((s) => enabled.has(s.name) && s.errors.length === 0);
  for (const p of plugins) {
    if (!p.valid || !config.plugins[p.name]?.enabled) continue;
    for (const s of discoverSkills(path.join(p.dir, 'skills'), `plugin:${p.name}`)) {
      if (p.manifest.skills.includes(s.name) && s.errors.length === 0) skills.push({ ...s, name: `${p.name}-${s.name}` });
    }
  }
  return skills.map((s) => ({ ...s, path: path.relative(root, s.file).split(path.sep).join('/') }));
}

export function install(root, config, { force = false } = {}) {
  const manifest = readJson(manifestPath(root), { files: {}, blocks: [], json: [] });
  const report = { created: [], updated: [], unchanged: [], skipped: [], removed: [] };
  const files = {};
  const wanted = new Set();

  const writeFile = (rel, content) => {
    wanted.add(rel);
    const abs = path.join(root, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (current === content) {
      files[rel] = sha(content);
      return report.unchanged.push(rel);
    }
    if (current !== null && !force) {
      const tracked = manifest.files[rel];
      if (!tracked) return report.skipped.push({ path: rel, reason: 'exists and was not created by Jagernator (use --force to overwrite)' });
      if (tracked !== sha(current)) {
        files[rel] = tracked;
        return report.skipped.push({ path: rel, reason: 'modified locally (use --force to overwrite)' });
      }
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    files[rel] = sha(content);
    report[current === null ? 'created' : 'updated'].push(rel);
  };

  const writeIfChanged = (rel, next, before) => {
    if (next === before) return report.unchanged.push(rel);
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), next);
    report[before === null ? 'created' : 'updated'].push(rel);
  };
  const readOrNull = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf8') : null);

  // 1. Directory skeleton and create-only files.
  for (const d of ['state', 'logs', 'plugins']) fs.mkdirSync(path.join(root, JAG_DIR, d), { recursive: true });
  writeFile(`${JAG_DIR}/.gitignore`, '# Local, per-machine Jagernator data. Never commit.\nstate/\nlogs/\n');
  if (!fs.existsSync(path.join(root, IGNORE_FILE))) writeIfChanged(IGNORE_FILE, DEFAULT_IGNORE, null);

  // 2. Canonical policies and enabled core skills.
  for (const f of walk(path.join(PKG_ROOT, 'policies'))) {
    writeFile(`${JAG_DIR}/policies/${f}`, fs.readFileSync(path.join(PKG_ROOT, 'policies', f), 'utf8'));
  }
  const core = new Set(discoverSkills(path.join(PKG_ROOT, 'skills')).map((s) => s.name));
  for (const name of config.skills.enabled) {
    if (!core.has(name)) continue; // custom skill: user-owned, lives in .jagernator/skills/<name>
    const src = path.join(PKG_ROOT, 'skills', name);
    for (const f of walk(src)) writeFile(`${JAG_DIR}/skills/${name}/${f}`, fs.readFileSync(path.join(src, f), 'utf8'));
  }

  // 3. Adapter files.
  const plugins = loadPlugins(root);
  const ctx = {
    config,
    project: detectProject(root),
    skills: collectSkills(root, config, plugins),
    destinations: createNetworkPolicy(config, plugins).destinations,
  };
  const blocks = [];
  const jsons = [];
  for (const agent of config.agents) {
    for (const op of adapters[agent](ctx)) {
      if (op.type === 'file') writeFile(op.path, op.content);
      else if (op.type === 'block') {
        blocks.push(op.path);
        const before = readOrNull(op.path);
        writeIfChanged(op.path, upsertBlock(before, op.body), before);
      } else if (op.type === 'json') {
        jsons.push(op.path);
        const before = readOrNull(op.path);
        let parsed;
        try {
          parsed = before === null ? {} : JSON.parse(before);
        } catch (err) {
          report.skipped.push({ path: op.path, reason: `not valid JSON (${err.message}); fix it and rerun` });
          continue;
        }
        writeIfChanged(op.path, JSON.stringify(op.merge(parsed), null, 2) + '\n', before);
      }
    }
  }

  // 4. Remove what a previous install created but is no longer wanted (e.g. a disabled skill or agent).
  for (const [rel, hash] of Object.entries(manifest.files)) {
    if (wanted.has(rel)) continue;
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    if (sha(fs.readFileSync(abs, 'utf8')) !== hash && !force) {
      report.skipped.push({ path: rel, reason: 'no longer managed but modified locally; left in place' });
      continue;
    }
    fs.unlinkSync(abs);
    removeEmptyDirs(root, rel);
    report.removed.push(rel);
  }
  for (const rel of manifest.blocks.filter((b) => !blocks.includes(b))) {
    const before = readOrNull(rel);
    if (before === null || !before.includes(BEGIN)) continue;
    const next = before.slice(0, before.indexOf(BEGIN)).replace(/\n+$/, '\n') + before.slice(before.indexOf(END) + END.length).replace(/^\n+/, '');
    writeIfChanged(rel, next, before);
    report.removed.push(`${rel} (managed block)`);
  }
  for (const rel of manifest.json.filter((j) => !jsons.includes(j))) {
    const before = readOrNull(rel);
    if (before === null || !JSON_REMOVERS[rel]) continue;
    try {
      writeIfChanged(rel, JSON.stringify(JSON_REMOVERS[rel](JSON.parse(before)), null, 2) + '\n', before);
      report.removed.push(`${rel} (Jagernator entries)`);
    } catch {
      report.skipped.push({ path: rel, reason: 'not valid JSON; Jagernator entries not removed' });
    }
  }

  const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const next = { files: sortedFiles, blocks, json: jsons };
  const prevComparable = JSON.stringify({ files: manifest.files, blocks: manifest.blocks, json: manifest.json });
  if (JSON.stringify(next) !== prevComparable) writeJson(manifestPath(root), next);
  return { report };
}

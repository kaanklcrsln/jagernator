// Skill discovery reads only frontmatter (name + description). Full skill bodies and
// references are loaded on demand, never preloaded.
import fs from 'node:fs';
import path from 'node:path';
import { parseYaml } from '../config/yaml.js';

const HEADER_BYTES = 4096;

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: null, body: text };
  return { meta: parseYaml(m[1]) || {}, body: text.slice(m[0].length) };
}

function readHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(HEADER_BYTES);
    const n = fs.readSync(fd, buf, 0, HEADER_BYTES, 0);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/** Metadata for one skill directory: { name, description, dir, file, source, errors }. */
export function readSkillMeta(dir, source) {
  const file = path.join(dir, 'SKILL.md');
  const skill = { name: path.basename(dir), description: '', dir, file, source, errors: [] };
  if (!fs.existsSync(file)) {
    skill.errors.push('missing SKILL.md');
    return skill;
  }
  let meta;
  try {
    ({ meta } = parseFrontmatter(readHeader(file)));
  } catch (err) {
    skill.errors.push(`invalid frontmatter: ${err.message}`);
    return skill;
  }
  if (!meta) skill.errors.push('missing frontmatter (--- name/description ---)');
  else {
    if (meta.name !== skill.name) skill.errors.push(`frontmatter name "${meta.name}" does not match directory "${skill.name}"`);
    if (typeof meta.description !== 'string' || !meta.description.trim()) skill.errors.push('missing description');
    else if (meta.description.length > 1024) skill.errors.push('description longer than 1024 characters');
    else skill.description = meta.description.trim();
  }
  return skill;
}

/** Discover skills in `dir` (each subdirectory with SKILL.md). */
export function discoverSkills(dir, source = 'jagernator') {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readSkillMeta(path.join(dir, d.name), source))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Full skill content, loaded only when the skill is needed. */
export function loadSkill(skill) {
  return fs.readFileSync(skill.file, 'utf8');
}

/** Reference files a skill offers for on-demand loading (relative paths). */
export function skillReferences(skill) {
  const dir = path.join(skill.dir, 'references');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => `references/${f}`) : [];
}

#!/usr/bin/env node
// Static checks with no dependencies: JS syntax, product naming, packaged files.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = [];

for (const f of files.filter((f) => f.endsWith('.js'))) {
  const r = spawnSync(process.execPath, ['--check', path.join(root, f)], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`${f}: syntax error\n${r.stderr}`);
}
const wrongName = ['Jager', 'hub'].join('');
for (const f of files) {
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  if (text.toLowerCase().includes(wrongName.toLowerCase())) problems.push(`${f}: uses the wrong product name`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const entry of pkg.files) if (!fs.existsSync(path.join(root, entry))) problems.push(`package.json files: ${entry} missing`);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`check: ${files.length} files OK`);

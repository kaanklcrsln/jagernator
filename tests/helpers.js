import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BIN = path.join(REPO, 'bin', 'jagernator.js');

// Fake credentials built at runtime so the repository never contains secret-shaped literals.
export const FAKE = {
  github: 'ghp_' + 'A1b2C3d4E5'.repeat(4),
  aws: 'AKIA' + 'Q'.repeat(16),
  privateKey: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
};

export function tmpProject(files = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jagernator-test-')));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

export function git(dir, ...args) {
  return spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
}

/** Run the CLI in `cwd`. PATH is limited so agent detection is deterministic. */
export function cli(cwd, args, { input, env } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { PATH: path.dirname(process.execPath) + path.delimiter + '/usr/bin' + path.delimiter + '/bin', HOME: cwd, ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

export const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

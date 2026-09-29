import fs from 'node:fs';
import path from 'node:path';

export const IGNORE_FILE = '.jagernatorignore';

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return re;
}

/** Compile gitignore-style patterns (subset: *, **, ?, leading /, trailing /, !negation). */
export function compileIgnore(lines) {
  const rules = [];
  for (let raw of lines) {
    raw = raw.trim();
    if (!raw || raw.startsWith('#')) continue;
    const negate = raw.startsWith('!');
    let pat = negate ? raw.slice(1) : raw;
    // "dir/" is treated like "dir": it matches the directory itself and everything below it.
    if (pat.endsWith('/')) pat = pat.slice(0, -1);
    const anchored = pat.startsWith('/') || pat.includes('/');
    if (pat.startsWith('/')) pat = pat.slice(1);
    const body = globToRegExp(pat);
    const re = new RegExp(`^${anchored ? '' : '(?:.*/)?'}${body}(?:/.*)?$`);
    rules.push({ re, negate, source: raw });
  }
  return (relPath) => {
    const p = relPath.split(path.sep).join('/').replace(/^\.\//, '');
    let matched = null;
    for (const r of rules) if (r.re.test(p)) matched = r.negate ? null : r.source;
    return matched;
  };
}

/** Load .jagernatorignore from a project root. Returns a matcher: relPath -> matching pattern | null. */
export function loadIgnore(root) {
  const file = path.join(root, IGNORE_FILE);
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const matcher = compileIgnore(lines);
  matcher.patterns = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  return matcher;
}

export const DEFAULT_IGNORE = `# Paths Jagernator treats as unavailable to agent context (gitignore syntax).
# Git tracking status and sensitivity are different: list private data here even if it is committed.
# Enforced by Jagernator's Claude Code hooks; guidance-only for other agents.
private/
production/
secrets/
customer-data/
`;

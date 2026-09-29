import path from 'node:path';

// High-confidence patterns: distinctive prefixes/structure, low false-positive rate.
const PATTERNS = [
  { type: 'private-key', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { type: 'aws-access-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { type: 'aws-secret-access-key', re: /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}\b/gi },
  { type: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g },
  { type: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { type: 'slack-token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g },
  { type: 'stripe-key', re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { type: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { type: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { type: 'openai-key', re: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g },
  { type: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { type: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { type: 'auth-header', re: /\bauthorization\s*[:=]\s*["']?(?:bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi },
  { type: 'url-credentials', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"]+:[^\s@/'"]{3,}@[^\s'"]+/gi },
];

// Generic "name = value" assignments; only reported when the value looks random.
const GENERIC = /\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret|private[_-]?key)[A-Za-z0-9_.-]*)\s*[=:]\s*["']?([^\s"'`,;]{8,})/gi;
const PLACEHOLDER = /^(\$\{?|<|\{\{|%|process\.env|os\.environ|env\(|getenv|xxx|changeme|example|placeholder|your[_-]|dummy|redacted|\*+$|\[REDACTED)/i;

function entropy(s) {
  const counts = {};
  for (const c of s) counts[c] = (counts[c] || 0) + 1;
  return Object.values(counts).reduce((h, n) => h - (n / s.length) * Math.log2(n / s.length), 0);
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Find likely secrets in text. Findings never include the secret value itself.
 * @returns {{type: string, line: number, confidence: 'high'|'medium', start: number, end: number}[]}
 */
export function detectSecrets(text) {
  if (!text) return [];
  const findings = [];
  const seen = new Set();
  const add = (type, confidence, start, end) => {
    for (const f of findings) if (start < f.end && end > f.start) return; // overlapping, keep first
    const key = `${start}:${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ type, confidence, line: lineOf(text, start), start, end });
  };
  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) add(type, 'high', m.index, m.index + m[0].length);
  }
  GENERIC.lastIndex = 0;
  for (const m of text.matchAll(GENERIC)) {
    const value = m[2];
    if (PLACEHOLDER.test(value) || entropy(value) < 3.0) continue;
    const start = m.index + m[0].lastIndexOf(value);
    add('credential-assignment', 'medium', start, start + value.length);
  }
  return findings.sort((a, b) => a.start - b.start);
}

/** Replace detected secrets with [REDACTED:<type>]. */
export function redact(text) {
  if (!text) return text;
  const findings = detectSecrets(text);
  let out = '';
  let last = 0;
  for (const f of findings) {
    out += text.slice(last, f.start) + `[REDACTED:${f.type}]`;
    last = f.end;
  }
  return out + text.slice(last);
}

// Sensitive file names. Matched against the basename (case-insensitive).
const SENSITIVE_NAMES = [
  /^\.env$/,
  /^\.env\.(?!(example|sample|template|dist|defaults)$).+$/,
  /\.env$/, // e.g. production.env
  /\.(pem|key|p12|pfx|jks|keystore|asc|ppk|kdbx|tfstate|tfvars)$/,
  /^id_(rsa|dsa|ecdsa|ed25519)$/,
  /^credentials(\..+)?$/,
  /^secrets?(\..+)?$/,
  /^service-account.*\.json$/,
  /^\.(netrc|npmrc|pypirc|pgpass|git-credentials)$/,
  /^htpasswd$|^\.htpasswd$/,
];
const SENSITIVE_DIRS = [/(^|\/)\.ssh(\/|$)/, /(^|\/)\.aws(\/|$)/, /(^|\/)\.gnupg(\/|$)/, /(^|\/)\.docker\/config\.json$/, /(^|\/)\.kube\/config$/];
// Docs, public keys and source files (e.g. src/secrets.ts) are not credential stores.
const NOT_SENSITIVE = [/\.(pub|md|txt|[cm]?[jt]sx?|py|go|rs|java|kt|rb|php|cs|swift|c|h|cpp)$/];

/** True if the path names a file that commonly holds credentials. */
export function isSensitivePath(p) {
  const norm = p.split(path.sep).join('/');
  const base = path.posix.basename(norm).toLowerCase();
  if (NOT_SENSITIVE.some((re) => re.test(base))) return false;
  return SENSITIVE_NAMES.some((re) => re.test(base)) || SENSITIVE_DIRS.some((re) => re.test(norm));
}

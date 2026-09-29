import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSecrets, isSensitivePath, redact } from '../src/security/secrets.js';
import { sanitize, logEvent } from '../src/state/store.js';
import { FAKE, tmpProject, read } from './helpers.js';

test('detects high-confidence secrets with line numbers, without echoing values', () => {
  const text = `a\nconst t = "${FAKE.github}";\nkey=${FAKE.aws}\n${FAKE.privateKey}\nAuthorization: Bearer abcdefghijklmnop\npostgres://admin:hunter22@db.internal/app\n`;
  const f = detectSecrets(text);
  assert.deepEqual(f.map((x) => [x.type, x.line]), [
    ['github-token', 2],
    ['aws-access-key-id', 3],
    ['private-key', 4],
    ['auth-header', 5],
    ['url-credentials', 6],
  ]);
  for (const x of f) assert.equal(Object.values(x).includes(FAKE.github), false);
});

test('generic assignments need entropy and skip placeholders', () => {
  assert.equal(detectSecrets('password = "changeme123"').length, 0);
  assert.equal(detectSecrets('api_key: ${API_KEY}').length, 0);
  assert.equal(detectSecrets('password = aaaaaaaaaaaa').length, 0);
  const f = detectSecrets('client_secret = "Zx9Qm2Lp7Rt4Wv8K"');
  assert.equal(f.length, 1);
  assert.equal(f[0].confidence, 'medium');
});

test('ordinary code is not flagged', () => {
  assert.deepEqual(detectSecrets('function add(a, b) { return a + b; }\nconst url = "https://example.com/api";'), []);
});

test('redact replaces secrets', () => {
  const out = redact(`token ${FAKE.github} and ${FAKE.aws}`);
  assert.equal(out, 'token [REDACTED:github-token] and [REDACTED:aws-access-key-id]');
});

test('sensitive file detection', () => {
  for (const p of ['.env', '.env.local', 'config/.env.production', 'prod.env', 'certs/server.pem', 'tls.key', 'id_rsa', 'home/.ssh/config',
    'credentials.json', 'secrets.yaml', 'service-account-prod.json', '.npmrc', 'terraform.tfstate', '/Users/x/.aws/credentials']) {
    assert.equal(isSensitivePath(p), true, p);
  }
  for (const p of ['.env.example', '.env.sample', 'id_rsa.pub', 'src/security/secrets.js', 'docs/secrets.md', 'README.md', 'src/key.ts', 'environment.ts']) {
    assert.equal(isSensitivePath(p), false, p);
  }
});

test('log sanitization redacts and truncates', () => {
  const s = sanitize({ command: `curl -H "Authorization: Bearer ${FAKE.github}"`, nested: ['x'.repeat(500)] });
  assert.doesNotMatch(JSON.stringify(s), new RegExp(FAKE.github));
  assert.match(s.nested[0], /…\[truncated\]$/);
  const dir = tmpProject();
  logEvent(dir, { target: `echo ${FAKE.aws}` });
  const log = read(dir, '.jagernator/logs/events.jsonl');
  assert.doesNotMatch(log, new RegExp(FAKE.aws));
  assert.match(log, /REDACTED:aws-access-key-id/);
});

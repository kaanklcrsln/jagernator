import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as users from '../src/users.js';

test('helper exported and used', () => {
  assert.equal(typeof users.isValidEmail, 'function');
  assert.equal(users.isValidEmail('a@b.co'), true);
  assert.equal(users.isValidEmail('a@b'), false);
  assert.equal(users.isValidEmail(42), false);
  const src = fs.readFileSync(new URL('../src/users.js', import.meta.url), 'utf8');
  assert.equal(src.match(/\[\^@\\s\]\+@/g).length, 1, 'regex should appear once');
});
test('behavior preserved', () => {
  assert.throws(() => users.createUser('a', 'x'), /invalid email/);
  assert.deepEqual(users.updateEmail({ name: 'a' }, 'c@d.io'), { name: 'a', email: 'c@d.io' });
});

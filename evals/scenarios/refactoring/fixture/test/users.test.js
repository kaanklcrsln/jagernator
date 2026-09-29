import test from 'node:test';
import assert from 'node:assert/strict';
import { createUser, updateEmail } from '../src/users.js';

test('create', () => assert.deepEqual(createUser('a', 'a@b.co'), { name: 'a', email: 'a@b.co' }));
test('update rejects bad email', () => assert.throws(() => updateEmail({}, 'nope'), /invalid email/));

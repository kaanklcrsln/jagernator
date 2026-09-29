import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUpload } from '../src/uploads.js';

test('rejects traversal', () => {
  for (const bad of ['../etc/passwd', 'a/../../x', '/etc/passwd', '..']) assert.throws(() => resolveUpload(bad), undefined, bad);
});
test('still resolves nested names', () => assert.equal(resolveUpload('img/a.png'), '/srv/uploads/img/a.png'));

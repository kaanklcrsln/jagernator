import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUpload } from '../src/uploads.js';

test('resolves plain names', () => assert.equal(resolveUpload('a.png'), '/srv/uploads/a.png'));

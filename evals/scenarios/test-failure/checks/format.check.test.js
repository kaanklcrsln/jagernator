import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isoDate } from '../src/format.js';

test('december', () => assert.equal(isoDate(new Date(Date.UTC(2023, 11, 31))), '2023-12-31'));
test('original test untouched', () => {
  const t = fs.readFileSync(new URL('../test/format.test.js', import.meta.url), 'utf8');
  assert.match(t, /'2024-01-05'/);
});

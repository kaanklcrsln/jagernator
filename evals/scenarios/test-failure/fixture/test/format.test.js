import test from 'node:test';
import assert from 'node:assert/strict';
import { isoDate } from '../src/format.js';

test('isoDate', () => assert.equal(isoDate(new Date(Date.UTC(2024, 0, 5))), '2024-01-05'));

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLeapYear } from '../src/dates.js';

test('leap years', () => {
  for (const [y, v] of [[2024, true], [1900, false], [2000, true], [2023, false]]) assert.equal(isLeapYear(y), v, String(y));
});

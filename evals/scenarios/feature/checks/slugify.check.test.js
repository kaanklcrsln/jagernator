import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/strings.js';

test('slugify', () => {
  assert.equal(slugify('  Hello, World!  '), 'hello-world');
  assert.equal(slugify('a--b__c'), 'a-b-c');
  assert.equal(slugify('---'), '');
});

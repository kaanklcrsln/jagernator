import test from 'node:test';
import assert from 'node:assert/strict';
import { capitalize } from '../src/strings.js';

test('capitalize', () => assert.equal(capitalize('abc'), 'Abc'));

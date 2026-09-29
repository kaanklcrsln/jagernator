import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/client.js';

test('defaults', () => assert.equal(createClient().config.requestTimeoutMs, 5000));
test('override', () => assert.equal(createClient().withTimeout(10).config.requestTimeoutMs, 10));

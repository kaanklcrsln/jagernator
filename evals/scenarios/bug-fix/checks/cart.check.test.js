import test from 'node:test';
import assert from 'node:assert/strict';
import { total } from '../src/cart.js';

test('percentage discount', () => assert.equal(total([{ price: 50, qty: 2 }], 10), 90));
test('no discount unchanged', () => assert.equal(total([{ price: 19.99, qty: 1 }]), 19.99));

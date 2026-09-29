import test from 'node:test';
import assert from 'node:assert/strict';
import { subtotal, total } from '../src/cart.js';

test('subtotal', () => assert.equal(subtotal([{ price: 2, qty: 3 }]), 6));
test('total without discount', () => assert.equal(total([{ price: 10, qty: 1 }]), 10));

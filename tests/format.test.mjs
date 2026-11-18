import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatInt, formatTime, formatPercent } from '../src/util/format.js';

test('formatNumber: small numbers', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(7), '7');
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(4.5), '4.5');
  assert.equal(formatNumber(0.25), '0.25');
  assert.equal(formatNumber(12.34), '12.3');
});

test('formatNumber: suffixes', () => {
  assert.equal(formatNumber(1000), '1K');
  assert.equal(formatNumber(1234), '1.23K');
  assert.equal(formatNumber(15300), '15.3K');
  assert.equal(formatNumber(999999), '1M', 'rounds up across a tier boundary');
  assert.equal(formatNumber(2.5e9), '2.5B');
  assert.equal(formatNumber(1e12), '1T');
  assert.equal(formatNumber(7.89e15), '7.89Qa');
  assert.equal(formatNumber(600e6), '600M');
});

test('formatNumber: huge, negative and invalid values', () => {
  assert.match(formatNumber(3e40), /e/);
  assert.equal(formatNumber(-1500), '-1.5K');
  assert.equal(formatNumber(Infinity), '∞');
  assert.equal(formatNumber(NaN), '0');
});

test('formatInt and formatPercent', () => {
  assert.equal(formatInt(1234567), '1,234,567');
  assert.equal(formatPercent(0.256), '25.6%');
  assert.equal(formatPercent(1), '100%');
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00.00');
  assert.equal(formatTime(151420), '2:31.42');
  assert.equal(formatTime(3600000 + 61000 + 50), '1:01:01.05');
  assert.equal(formatTime(61000, { centis: false }), '1:01');
  assert.equal(formatTime(null), '--:--');
});

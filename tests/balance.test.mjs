import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../tools/balance-sim.mjs';

test('balance: every level is completable at a sensible pace', () => {
  const { results, totalSeconds } = simulate({ skill: 0.8 });
  assert.equal(results.length, 10);
  for (const r of results) {
    assert.ok(r.done, `level ${r.level} must be completable`);
    assert.ok(r.completeSec >= 90, `level ${r.level} too fast (${r.completeSec}s)`);
    assert.ok(r.completeSec <= 14 * 60, `level ${r.level} too slow (${r.completeSec}s)`);
  }
  assert.ok(totalSeconds >= 40 * 60 && totalSeconds <= 120 * 60, `total ${totalSeconds}s`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { raycastVoxels } from '../src/world/Raycaster.js';
import { makeFlatWorld } from './helpers.mjs';

test('ray straight down hits the ground top face', () => {
  const w = makeFlatWorld(10);
  const hit = raycastVoxels(w, 8.5, 15.5, 8.5, 0, -1, 0, 10);
  assert.ok(hit);
  assert.deepEqual([hit.x, hit.y, hit.z], [8, 9, 8]);
  assert.deepEqual([hit.nx, hit.ny, hit.nz], [0, 1, 0]);
  assert.ok(Math.abs(hit.dist - 5.5) < 1e-9);
});

test('ray in +x hits the near face with normal -x', () => {
  const w = makeFlatWorld(10);
  w.setBlock(12, 12, 8, 3);
  const hit = raycastVoxels(w, 8.5, 12.5, 8.5, 1, 0, 0, 10);
  assert.deepEqual([hit.x, hit.y, hit.z], [12, 12, 8]);
  assert.deepEqual([hit.nx, hit.ny, hit.nz], [-1, 0, 0]);
  assert.ok(Math.abs(hit.dist - 3.5) < 1e-9);
});

test('ray in -x and -z (negative directions) hits correctly', () => {
  const w = makeFlatWorld(10);
  w.setBlock(4, 12, 8, 3);
  const a = raycastVoxels(w, 8.5, 12.5, 8.5, -1, 0, 0, 10);
  assert.deepEqual([a.x, a.nx], [4, 1]);
  assert.ok(Math.abs(a.dist - 3.5) < 1e-9);

  w.setBlock(8, 12, 3, 3);
  const b = raycastVoxels(w, 8.5, 12.5, 8.5, 0, 0, -1, 10);
  assert.deepEqual([b.z, b.nz], [3, 1]);
});

test('ray into the sky misses and range limit is respected', () => {
  const w = makeFlatWorld(10);
  assert.equal(raycastVoxels(w, 8.5, 15.5, 8.5, 0, 1, 0, 10), null);
  assert.equal(raycastVoxels(w, 8.5, 25.5, 8.5, 0, -1, 0, 5), null, 'ground is beyond reach');
  assert.ok(raycastVoxels(w, 8.5, 25.5, 8.5, 0, -1, 0, 20));
});

test('random diagonal rays always return a solid block next to an air block', () => {
  const w = makeFlatWorld(10);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  let hits = 0;
  for (let i = 0; i < 500; i++) {
    let dx = rnd(), dy = -Math.abs(rnd()) - 0.05, dz = rnd();
    const l = Math.hypot(dx, dy, dz);
    dx /= l; dy /= l; dz /= l;
    const hit = raycastVoxels(w, 8.2, 14.7, 8.9, dx, dy, dz, 30);
    if (!hit) continue;
    hits++;
    assert.notEqual(w.getBlock(hit.x, hit.y, hit.z), 0);
    assert.equal(w.getBlock(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz), 0);
    assert.equal(Math.abs(hit.nx) + Math.abs(hit.ny) + Math.abs(hit.nz), 1);
  }
  assert.ok(hits > 400);
});

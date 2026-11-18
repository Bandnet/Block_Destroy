import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/World.js';
import { WorldGenerator, DEFAULT_PROFILE } from '../src/world/WorldGenerator.js';
import { WORLD_HEIGHT } from '../src/world/constants.js';
import { MATERIAL_IDS } from '../src/data/materials.js';
import { makeEmptyWorld } from './helpers.mjs';

test('setBlock / getBlock work across chunk boundaries and negative coordinates', () => {
  const w = makeEmptyWorld();
  for (const [cx, cz] of [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0]]) w.ensureChunk(cx, 0, cz);
  assert.equal(w.setBlock(-1, 3, -1, 3), true);
  assert.equal(w.getBlock(-1, 3, -1), 3);
  assert.equal(w.setBlock(15, 3, 0, 4), true);
  assert.equal(w.getBlock(15, 3, 0), 4);
  assert.equal(w.getBlock(16, 3, 0), 0);
  assert.equal(w.setBlock(15, 3, 0, 4), false, 'setting the same id is a no-op');
});

test('chunk block count follows set and break', () => {
  const w = makeEmptyWorld();
  const c = w.ensureChunk(0, 0, 0);
  w.setBlock(1, 1, 1, 3);
  w.setBlock(2, 1, 1, 3);
  assert.equal(c.count, 2);
  assert.equal(w.breakBlock(1, 1, 1), 3);
  assert.equal(c.count, 1);
  assert.equal(w.breakBlock(1, 1, 1), 0, 'breaking air returns 0');
});

test('out-of-world and unloaded semantics', () => {
  const w = makeEmptyWorld();
  w.ensureChunk(0, 0, 0);
  assert.equal(w.isSolid(0, -1, 0), true, 'floor is solid');
  assert.equal(w.isSolid(0, WORLD_HEIGHT, 0), false, 'sky is open');
  assert.equal(w.isSolid(100, 5, 100), true, 'unloaded counts as solid');
  assert.equal(w.getBlock(100, 5, 100), 0, 'unloaded reads as air');
  assert.equal(w.setBlock(100, 5, 100, 3), false, 'cannot write to unloaded chunk');
});

test('breaking a corner block marks all 8 touching chunks dirty', () => {
  const w = makeEmptyWorld();
  for (let cx = 0; cx <= 1; cx++) for (let cy = 0; cy <= 1; cy++) for (let cz = 0; cz <= 1; cz++) w.ensureChunk(cx, cy, cz);
  w.setBlock(16, 16, 16, 3);
  w.dirtyChunks.clear();
  w.setBlock(16, 16, 16, 0); // local (0,0,0) of chunk (1,1,1)
  assert.equal(w.dirtyChunks.size, 8);
});

test('breaking an interior block marks only its own chunk', () => {
  const w = makeEmptyWorld();
  for (let cx = 0; cx <= 1; cx++) w.ensureChunk(cx, 0, 0);
  w.setBlock(5, 5, 5, 3);
  w.dirtyChunks.clear();
  w.setBlock(5, 5, 5, 0);
  assert.equal(w.dirtyChunks.size, 1);
});

test('generator is deterministic and seed dependent', () => {
  const gen = (seed) => new World({ generator: new WorldGenerator({ ...DEFAULT_PROFILE, seed }) });
  const a = gen(1), b = gen(1), c = gen(2);
  for (const w of [a, b, c]) w.loadColumn(3, -2);
  const get = (w) => Buffer.concat(w.columns.get((3 + 32768) * 65536 + (-2 + 32768)).chunks.map((ch) => Buffer.from(ch.blocks)));
  assert.ok(get(a).equals(get(b)), 'same seed, same terrain');
  assert.ok(!get(a).equals(get(c)), 'different seed, different terrain');
});

test('generated terrain: grass on top, dirt below, stone deeper, ores exist', () => {
  const w = new World({ generator: new WorldGenerator() });
  w.preload(8, 8, 4);
  const sy = w.getSurfaceY(8, 8);
  assert.ok(sy > 5 && sy < WORLD_HEIGHT - 4);
  assert.equal(w.getBlock(8, sy, 8), MATERIAL_IDS.GRASS);
  assert.equal(w.getBlock(8, sy - 1, 8), MATERIAL_IDS.DIRT);
  assert.equal(w.getBlock(8, 0, 8) !== 0, true);

  const seen = new Set();
  for (const chunk of w.chunks.values()) for (const id of chunk.blocks) if (id) seen.add(id);
  for (const id of [MATERIAL_IDS.GRASS, MATERIAL_IDS.DIRT, MATERIAL_IDS.STONE, MATERIAL_IDS.IRON]) {
    assert.ok(seen.has(id), `material ${id} generated`);
  }
});

test('streaming loads nearest first, unloads far columns, and regenerates mined blocks', () => {
  const unloaded = [];
  const w = new World({ generator: new WorldGenerator(), renderDistance: 3 });
  w.onChunkUnload = (c) => unloaded.push(c);
  w.preload(8, 8, 1);
  for (let i = 0; i < 40; i++) w.update(8, 8, 4);
  assert.ok(w.columns.size > 20, 'ring filled in');

  const sy = w.getSurfaceY(8, 8);
  w.breakBlock(8, sy, 8);
  assert.equal(w.getBlock(8, sy, 8), 0);

  // walk far away so the column unloads, then come back
  for (let i = 0; i < 60; i++) w.update(8 + 200, 8, 4);
  assert.ok(unloaded.length > 0, 'old chunks unloaded');
  for (let i = 0; i < 80; i++) w.update(8, 8, 4);
  assert.equal(w.getBlock(8, sy, 8) !== 0, true, 'mined block regenerated after reload');
});

test('chunk generation is fast enough for streaming', () => {
  const w = new World({ generator: new WorldGenerator() });
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) w.loadColumn(i, 0);
  const perColumn = (performance.now() - t0) / 20;
  console.log(`  generation: ${perColumn.toFixed(2)} ms per column`);
  assert.ok(perColumn < 15);
});

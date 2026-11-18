import test from 'node:test';
import assert from 'node:assert/strict';
import { meshChunk } from '../src/world/ChunkMesher.js';
import { World } from '../src/world/World.js';
import { WorldGenerator } from '../src/world/WorldGenerator.js';
import { makeEmptyWorld } from './helpers.mjs';

function blockAt(world, cx, cy, cz, lx, ly, lz, id = 3) {
  const c = world.ensureChunk(cx, cy, cz);
  c.blocks[(ly * 16 + lz) * 16 + lx] = id;
  c.count++;
  return c;
}

test('single block has 6 faces: 24 vertices and 36 indices', () => {
  const w = makeEmptyWorld();
  const c = blockAt(w, 0, 1, 0, 5, 5, 5);
  const m = meshChunk(w, c);
  assert.equal(m.vertexCount, 24);
  assert.equal(m.indexCount, 36);
  for (const i of m.indices) assert.ok(i < m.vertexCount);
});

test('every triangle faces outward (winding is correct)', () => {
  const w = makeEmptyWorld();
  const c = blockAt(w, 0, 1, 0, 5, 5, 5);
  const m = meshChunk(w, c);
  const center = [5.5, 5.5, 5.5];
  const p = m.positions;
  for (let t = 0; t < m.indexCount; t += 3) {
    const [a, b, d] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const cen = [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3];
    const out = [cen[0] - center[0], cen[1] - center[1], cen[2] - center[2]];
    const dot = n[0] * out[0] + n[1] * out[1] + n[2] * out[2];
    assert.ok(dot > 0, `triangle ${t / 3} faces inward`);
  }
});

test('winding stays correct when AO flips the quad diagonal', () => {
  const w = makeEmptyWorld();
  const c = blockAt(w, 0, 1, 0, 5, 5, 5);
  blockAt(w, 0, 1, 0, 6, 6, 5); // occludes one corner of the +y face of the first block
  blockAt(w, 0, 1, 0, 4, 4, 4); // and a corner of the -y face
  const m = meshChunk(w, c);
  const p = m.positions;
  for (let t = 0; t < m.indexCount; t += 3) {
    const [a, b, d] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    // every triangle must have a non-degenerate normal that is axis aligned
    const nz = n.filter((v) => Math.abs(v) > 1e-6).length;
    assert.equal(nz, 1, 'triangle is a non-degenerate axis-aligned face');
  }
});

test('two adjacent blocks hide their shared faces', () => {
  const w = makeEmptyWorld();
  const c = blockAt(w, 0, 1, 0, 5, 5, 5);
  blockAt(w, 0, 1, 0, 6, 5, 5);
  const m = meshChunk(w, c);
  assert.equal(m.vertexCount, 10 * 4);
  assert.equal(m.indexCount, 10 * 6);
});

test('faces against an unloaded neighbour chunk are culled', () => {
  const w = makeEmptyWorld();
  const c = blockAt(w, 0, 1, 0, 0, 0, 0); // corner of the chunk, 3 neighbours unloaded
  const m = meshChunk(w, c);
  assert.equal(m.vertexCount, 3 * 4);
});

test('faces against a loaded air neighbour chunk are drawn', () => {
  const w = makeEmptyWorld();
  const c = blockAt(w, 0, 1, 0, 0, 0, 0);
  w.ensureChunk(-1, 1, 0);
  w.ensureChunk(0, 0, 0);
  w.ensureChunk(0, 1, -1);
  const m = meshChunk(w, c);
  assert.equal(m.vertexCount, 6 * 4);
});

test('empty chunk and fully buried chunk produce no mesh', () => {
  const w = makeEmptyWorld();
  const empty = w.ensureChunk(0, 0, 0);
  assert.equal(meshChunk(w, empty), null);

  // A separate world, so no loaded air chunk touches the solid one.
  const w2 = makeEmptyWorld();
  const full = w2.ensureChunk(0, 1, 0);
  full.blocks.fill(3);
  full.count = 4096;
  assert.equal(meshChunk(w2, full), null, 'solid chunk surrounded by unloaded (solid) chunks is invisible');

  // With loaded air below it, exactly one 16x16 face is exposed.
  w2.ensureChunk(0, 0, 0);
  const m = meshChunk(w2, full);
  assert.equal(m.vertexCount, 16 * 16 * 4);
});

test('vertex colours (AO) darken occluded corners', () => {
  const w = makeEmptyWorld();
  const c = blockAt(w, 0, 1, 0, 5, 5, 5);
  blockAt(w, 0, 1, 0, 6, 6, 5);
  const m = meshChunk(w, c);
  const shades = new Set();
  for (let i = 0; i < m.colors.length; i += 3) shades.add(m.colors[i].toFixed(3));
  assert.ok(shades.size > 6, 'multiple shade values from directional light + AO');
});

test('UVs stay inside the 0..1 range and inside the material tile', () => {
  const w = makeEmptyWorld();
  const c = blockAt(w, 0, 1, 0, 5, 5, 5, 10);
  const m = meshChunk(w, c);
  for (const v of m.uvs) assert.ok(v >= 0 && v <= 1);
  // material 10 = tile 9 -> col 1, row 2 of a 4x4 atlas
  for (let i = 0; i < m.uvs.length; i += 2) {
    assert.ok(m.uvs[i] > 0.25 && m.uvs[i] < 0.5);
    assert.ok(m.uvs[i + 1] > 0.25 && m.uvs[i + 1] < 0.5);
  }
});

test('meshing a real terrain chunk is fast and buffers stay consistent', () => {
  const w = new World({ generator: new WorldGenerator() });
  w.preload(8, 8, 3);
  const sy = w.getSurfaceY(8, 8);
  const chunk = w.getChunk(0, sy >> 4, 0);
  const t0 = performance.now();
  let m;
  for (let i = 0; i < 50; i++) m = meshChunk(w, chunk);
  const avg = (performance.now() - t0) / 50;
  console.log(`  meshing: ${avg.toFixed(2)} ms per chunk, ${m.vertexCount} verts, ${m.indexCount / 3} tris`);
  assert.ok(avg < 10);
  assert.equal(m.indexCount % 6, 0);
  assert.equal(m.positions.length, m.vertexCount * 3);
  assert.equal(m.uvs.length, m.vertexCount * 2);
  for (const i of m.indices) assert.ok(i < m.vertexCount);
});

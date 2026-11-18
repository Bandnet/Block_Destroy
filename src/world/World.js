import { CHUNK_SIZE as S, WORLD_HEIGHT, WORLD_HEIGHT_CHUNKS } from './constants.js';
import { Chunk } from './Chunk.js';

const OFFSET = 32768;
const colKey = (cx, cz) => (cx + OFFSET) * 65536 + (cz + OFFSET);
export const chunkKey = (cx, cy, cz) => colKey(cx, cz) * 8 + cy;

/**
 * Streamed voxel world.
 *
 * - Chunks are generated in columns around the player and dropped when far away.
 *   Dropped chunks lose their changes, so mined areas regenerate. That is what
 *   lets later levels demand millions of destroyed blocks.
 * - All coordinates passed to getBlock/isSolid/setBlock MUST be integers.
 * - A chunk that is not loaded counts as solid for collision and face culling,
 *   so the player cannot fall out of the world and no hidden faces are drawn.
 */
export class World {
  constructor({ generator, renderDistance = 6 }) {
    this.generator = generator;
    this.renderDistance = renderDistance;

    this.chunks = new Map(); // chunkKey -> Chunk
    this.columns = new Map(); // colKey -> { cx, cz, chunks: Chunk[] }
    this.dirtyChunks = new Set(); // chunks whose mesh must be rebuilt

    this.onChunkUnload = null; // (chunk) => void

    this._pending = [];
    this._centerCX = NaN;
    this._centerCZ = NaN;
  }

  // ---------- chunk access ----------

  getChunk(cx, cy, cz) {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  ensureChunk(cx, cy, cz) {
    const key = chunkKey(cx, cy, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cy, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  // ---------- block access ----------

  /** Block id at integer coords. Unloaded or out-of-world reads as air. */
  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const chunk = this.chunks.get(chunkKey(x >> 4, y >> 4, z >> 4));
    if (!chunk) return 0;
    return chunk.blocks[(((y & 15) * S) + (z & 15)) * S + (x & 15)];
  }

  /** Solid for physics and face culling. Unloaded chunks and the floor are solid. */
  isSolid(x, y, z) {
    if (y < 0) return true;
    if (y >= WORLD_HEIGHT) return false;
    const chunk = this.chunks.get(chunkKey(x >> 4, y >> 4, z >> 4));
    if (!chunk) return true;
    return chunk.blocks[(((y & 15) * S) + (z & 15)) * S + (x & 15)] !== 0;
  }

  /** Returns true if the block actually changed. */
  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const chunk = this.chunks.get(chunkKey(x >> 4, y >> 4, z >> 4));
    if (!chunk) return false;
    const i = (((y & 15) * S) + (z & 15)) * S + (x & 15);
    const old = chunk.blocks[i];
    if (old === id) return false;
    chunk.blocks[i] = id;
    chunk.count += (id !== 0 ? 1 : 0) - (old !== 0 ? 1 : 0);
    this._markDirtyAround(chunk, x & 15, y & 15, z & 15);
    return true;
  }

  /** Remove a block. Returns the previous id (0 if nothing was there). */
  breakBlock(x, y, z) {
    const old = this.getBlock(x, y, z);
    if (old === 0) return 0;
    this.setBlock(x, y, z, 0);
    return old;
  }

  /** Highest solid block y in a column, or -1. */
  getSurfaceY(x, z) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (this.getBlock(x, y, z) !== 0) return y;
    }
    return -1;
  }

  // A changed block can alter faces and ambient occlusion in every chunk it
  // touches (face, edge and corner neighbours), so mark all of them.
  _markDirtyAround(chunk, lx, ly, lz) {
    const ex = lx === 0 ? -1 : lx === S - 1 ? 1 : 0;
    const ey = ly === 0 ? -1 : ly === S - 1 ? 1 : 0;
    const ez = lz === 0 ? -1 : lz === S - 1 ? 1 : 0;
    for (let a = 0; a < 2; a++) {
      const dx = a ? ex : 0;
      if (a && !dx) continue;
      for (let b = 0; b < 2; b++) {
        const dy = b ? ey : 0;
        if (b && !dy) continue;
        const ncy = chunk.cy + dy;
        if (ncy < 0 || ncy >= WORLD_HEIGHT_CHUNKS) continue;
        for (let c = 0; c < 2; c++) {
          const dz = c ? ez : 0;
          if (c && !dz) continue;
          const n = this.chunks.get(chunkKey(chunk.cx + dx, ncy, chunk.cz + dz));
          if (n) this.dirtyChunks.add(n);
        }
      }
    }
  }

  // ---------- level changes and regrowth ----------

  /** Drop every chunk and switch to a new terrain generator (used when a level starts). */
  setGenerator(generator) {
    for (const key of [...this.columns.keys()]) this.unloadColumn(key);
    this.generator = generator;
    this.chunks.clear();
    this.dirtyChunks.clear();
    this._pending = [];
    this._centerCX = NaN;
    this._centerCZ = NaN;
  }

  /**
   * Regenerate columns that have been mined mostly empty and left alone for a
   * while, so there is always fresh ground to grind. Columns next to the player
   * are never touched. Returns how many columns were regrown.
   */
  regrow(px, pz, now, { idleMs = 6000, threshold = 0.45, minDistance = 2, maxColumns = 2 } = {}) {
    const ccx = Math.floor(px / S);
    const ccz = Math.floor(pz / S);
    let regrown = 0;
    for (const col of this.columns.values()) {
      if (regrown >= maxColumns) break;
      const dx = col.cx - ccx, dz = col.cz - ccz;
      if (dx * dx + dz * dz < minDistance * minDistance) continue;
      let gen = 0, cnt = 0, last = 0;
      for (const c of col.chunks) { gen += c.genCount; cnt += c.count; if (c.lastBreak > last) last = c.lastBreak; }
      if (gen === 0 || cnt >= gen * threshold || now - last < idleMs) continue;
      for (const c of col.chunks) {
        c.blocks.fill(0);
        c.damage = null;
        c.count = 0;
        c.lastBreak = 0;
        this.generator.generate(c);
        this.dirtyChunks.add(c);
      }
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.columns.get(colKey(col.cx + ox, col.cz + oz));
        if (n) for (const c of n.chunks) if (c.count > 0) this.dirtyChunks.add(c);
      }
      regrown++;
    }
    return regrown;
  }

  // ---------- streaming ----------

  loadColumn(cx, cz) {
    const key = colKey(cx, cz);
    if (this.columns.has(key)) return;

    const chunks = [];
    for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
      const chunk = this.ensureChunk(cx, cy, cz);
      this.generator.generate(chunk);
      chunks.push(chunk);
      if (chunk.count > 0) this.dirtyChunks.add(chunk);
    }
    this.columns.set(key, { cx, cz, chunks });

    // Neighbouring columns drew their borders against "unloaded = solid";
    // now that real data exists, their borders must be rebuilt.
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of near) {
      const col = this.columns.get(colKey(cx + dx, cz + dz));
      if (!col) continue;
      for (const c of col.chunks) if (c.count > 0) this.dirtyChunks.add(c);
    }
  }

  unloadColumn(key) {
    const col = this.columns.get(key);
    if (!col) return;
    for (const chunk of col.chunks) {
      this.chunks.delete(chunkKey(chunk.cx, chunk.cy, chunk.cz));
      this.dirtyChunks.delete(chunk);
      if (this.onChunkUnload) this.onChunkUnload(chunk);
    }
    this.columns.delete(key);
  }

  /** Synchronously load every column within `radius` chunks (used for spawn). */
  preload(px, pz, radius) {
    const ccx = Math.floor(px / S);
    const ccz = Math.floor(pz / S);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz <= radius * radius) this.loadColumn(ccx + dx, ccz + dz);
      }
    }
    this._centerCX = NaN; // force a pending-list rebuild on next update
  }

  /** Call every frame with the player position. */
  update(px, pz, maxColumnsPerFrame = 2) {
    const ccx = Math.floor(px / S);
    const ccz = Math.floor(pz / S);
    if (ccx !== this._centerCX || ccz !== this._centerCZ) {
      this._centerCX = ccx;
      this._centerCZ = ccz;
      this._rebuildPending();
      this._unloadFar();
    }
    for (let n = 0; n < maxColumnsPerFrame && this._pending.length; n++) {
      const { cx, cz } = this._pending.shift();
      this.loadColumn(cx, cz);
    }
  }

  _rebuildPending() {
    const R = this.renderDistance;
    const list = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = dx * dx + dz * dz;
        if (d > R * R) continue;
        const cx = this._centerCX + dx;
        const cz = this._centerCZ + dz;
        if (!this.columns.has(colKey(cx, cz))) list.push({ cx, cz, d });
      }
    }
    list.sort((a, b) => a.d - b.d);
    this._pending = list;
  }

  _unloadFar() {
    const limit = (this.renderDistance + 1.5) ** 2;
    for (const [key, col] of this.columns) {
      const dx = col.cx - this._centerCX;
      const dz = col.cz - this._centerCZ;
      if (dx * dx + dz * dz > limit) this.unloadColumn(key);
    }
  }
}

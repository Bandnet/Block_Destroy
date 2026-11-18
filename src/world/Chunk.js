import { CHUNK_SIZE, CHUNK_VOLUME } from './constants.js';

/**
 * A 16x16x16 cube of blocks. One byte per block (material id, 0 = air).
 * No per-block objects exist anywhere in the game.
 */
export class Chunk {
  constructor(cx, cy, cz) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.originX = cx * CHUNK_SIZE;
    this.originY = cy * CHUNK_SIZE;
    this.originZ = cz * CHUNK_SIZE;
    this.blocks = new Uint8Array(CHUNK_VOLUME);
    this.count = 0; // number of non-air blocks (lets us skip empty chunks)
    this.genCount = 0; // block count right after generation (used for regrowth)
    this.damage = null; // Map<localIndex, damage> for partially damaged blocks (created lazily)
    this.lastBreak = 0; // performance.now() of the last block removed (ms)
  }

  static index(lx, ly, lz) {
    return (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }
}

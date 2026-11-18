import { World } from '../src/world/World.js';
import { WORLD_HEIGHT_CHUNKS } from '../src/world/constants.js';

const emptyGenerator = { generate() {} };

/** World with no generator; chunks are created by hand. */
export function makeEmptyWorld() {
  return new World({ generator: emptyGenerator, renderDistance: 4 });
}

/**
 * Flat world: solid stone for y < groundTop, air above. Columns -2..2 are fully
 * created (all vertical chunks) so unloaded-is-solid never interferes.
 */
export function makeFlatWorld(groundTop = 10, stoneId = 3) {
  const world = makeEmptyWorld();
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
        const chunk = world.ensureChunk(cx, cy, cz);
        for (let ly = 0; ly < 16; ly++) {
          const wy = cy * 16 + ly;
          if (wy >= groundTop) break;
          for (let lz = 0; lz < 16; lz++) {
            for (let lx = 0; lx < 16; lx++) {
              chunk.blocks[(ly * 16 + lz) * 16 + lx] = stoneId;
              chunk.count++;
            }
          }
        }
      }
    }
  }
  world.dirtyChunks.clear();
  return world;
}

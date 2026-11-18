import { CHUNK_SIZE as S, WORLD_HEIGHT } from './constants.js';
import { MATERIAL_IDS } from '../data/materials.js';
import { fbm2, hash01 } from './noise.js';

/**
 * Terrain profile (level.terrain). Shapes:
 *   hills     rolling heightmap
 *   cave      floor with a stone ceiling
 *   quarry    terraced steps
 *   ridges    sharp crystalline ridges
 *   islands   floating islands over a void
 *   shafts    a grid of pillars and channels
 *   monolith  a flat plain with one enormous tower
 *
 * Blocks: the very top layer uses `surface`, the next `subsurfaceDepth` layers use
 * `subsurface`, everything else is picked from the weighted `mix` in coherent
 * patches (so ore appears in clusters rather than as noise).
 */
export const DEFAULT_PROFILE = {
  seed: 1337,
  shape: 'hills',
  baseHeight: 30,
  amplitude: 9,
  scale: 48,
  surface: MATERIAL_IDS.GRASS,
  subsurface: MATERIAL_IDS.DIRT,
  subsurfaceDepth: 3,
  patch: 3,
  mix: [
    { id: MATERIAL_IDS.STONE, w: 0.8 },
    { id: MATERIAL_IDS.IRON, w: 0.2 },
  ],
};

function cumulative(mix) {
  const total = mix.reduce((a, m) => a + m.w, 0) || 1;
  let acc = 0;
  return mix.map((m) => ({ id: m.id, c: (acc += m.w / total) }));
}

export class WorldGenerator {
  constructor(profile = DEFAULT_PROFILE) {
    this.t = { ...DEFAULT_PROFILE, ...profile };
    this.mixC = cumulative(this.t.mix);
    this.towerC = this.t.towerMix ? cumulative(this.t.towerMix) : null;
    this._col = { bottom: 0, top: 0, ceil: -1, tower: false };
  }

  /** Where the player starts (x, z) and which way they face. */
  spawnPoint() {
    return { x: 8, z: 8 };
  }

  /**
   * Solid vertical range of a column. Returns a shared object (not re-entrant):
   * { bottom, top, ceil, tower } with top < bottom meaning "no land here".
   */
  columnRange(wx, wz) {
    const t = this.t;
    const c = this._col;
    c.bottom = 0;
    c.ceil = -1;
    c.tower = false;
    const clampTop = (v) => Math.max(4, Math.min(WORLD_HEIGHT - 4, Math.floor(v)));

    switch (t.shape) {
      case 'cave': {
        const n = fbm2(wx / t.scale, wz / t.scale, t.seed);
        c.top = clampTop(t.baseHeight + (n - 0.5) * 2 * t.amplitude);
        const n2 = fbm2((wx + 400) / (t.scale * 0.8), (wz - 300) / (t.scale * 0.8), t.seed + 7);
        c.ceil = Math.min(WORLD_HEIGHT - 2, c.top + t.ceilGap + Math.floor(n2 * t.ceilVar));
        break;
      }
      case 'quarry': {
        const n = fbm2(wx / t.scale, wz / t.scale, t.seed);
        const h = (n - 0.5) * 2 * t.amplitude;
        c.top = clampTop(t.baseHeight + Math.round(h / t.step) * t.step);
        break;
      }
      case 'ridges': {
        const n = fbm2(wx / t.scale, wz / t.scale, t.seed);
        const ridge = 1 - Math.abs(2 * n - 1);
        c.top = clampTop(t.baseHeight + ridge * ridge * t.amplitude * 1.6 - t.amplitude * 0.3);
        break;
      }
      case 'islands': {
        const sp = this.spawnPoint();
        let n = fbm2(wx / t.scale, wz / t.scale, t.seed);
        const d = Math.hypot(wx - sp.x, wz - sp.z);
        n += Math.max(0, 1 - d / t.spawnRadius) * 0.5; // guarantee land under the player
        if (n < t.threshold) {
          c.top = -1;
          c.bottom = 0;
        } else {
          const k = n - t.threshold;
          c.top = clampTop(t.baseHeight + k * 26);
          const thick = 5 + Math.floor(k * 60) + (hash01(wx >> 2, 0, wz >> 2, t.seed) < 0.5 ? 1 : 0);
          c.bottom = Math.max(1, c.top - thick);
        }
        break;
      }
      case 'shafts': {
        const cell = t.cell;
        const lx = ((wx % cell) + cell) % cell;
        const lz = ((wz % cell) + cell) % cell;
        const channel = lx === 0 || lz === 0 || lx === cell - 1 || lz === cell - 1;
        if (channel) {
          c.top = t.baseHeight - 10;
        } else {
          const h = hash01(Math.floor(wx / cell), 0, Math.floor(wz / cell), t.seed);
          c.top = t.baseHeight + Math.floor(h * 6) * 4;
        }
        c.top = clampTop(c.top);
        break;
      }
      case 'monolith': {
        const n = fbm2(wx / 30, wz / 30, t.seed);
        c.top = clampTop(t.baseHeight + (n - 0.5) * 3);
        if (Math.abs(wx - t.towerX) <= t.towerHalf && Math.abs(wz - t.towerZ) <= t.towerHalf) {
          c.top = t.towerHeight;
          c.tower = true;
        }
        break;
      }
      default: { // hills
        const n = fbm2(wx / t.scale, wz / t.scale, t.seed);
        c.top = clampTop(t.baseHeight + (n - 0.5) * 2 * t.amplitude);
      }
    }
    return c;
  }

  /** Fill a chunk's block array in place (the array must be empty). */
  generate(chunk) {
    const t = this.t;
    const blocks = chunk.blocks;
    const oy = chunk.originY;
    const oyTop = oy + S - 1;
    let count = 0;

    for (let lz = 0; lz < S; lz++) {
      for (let lx = 0; lx < S; lx++) {
        const wx = chunk.originX + lx;
        const wz = chunk.originZ + lz;
        const col = this.columnRange(wx, wz);
        const top = col.top, bottom = col.bottom, ceil = col.ceil, tower = col.tower;

        const hasLand = top >= bottom && top >= oy && bottom <= oyTop;
        const hasCeil = ceil >= 0 && oyTop >= ceil;
        if (!hasLand && !hasCeil) continue;

        for (let ly = 0; ly < S; ly++) {
          const wy = oy + ly;
          let id = 0;
          if (wy >= bottom && wy <= top) {
            const depth = top - wy;
            if (depth === 0 && t.surface && !tower) id = t.surface;
            else if (depth <= t.subsurfaceDepth && t.subsurface && !tower) id = t.subsurface;
            else id = this._pick(wx, wy, wz, tower && this.towerC ? this.towerC : this.mixC);
          } else if (ceil >= 0 && wy >= ceil) {
            id = this._pick(wx, wy, wz, this.mixC);
          }
          if (id !== 0) {
            blocks[(ly * S + lz) * S + lx] = id;
            count++;
          }
        }
      }
    }
    chunk.count = count;
    chunk.genCount = count;
  }

  /** Pick a material from a cumulative mix, in coherent patches. */
  _pick(wx, wy, wz, cum) {
    const t = this.t;
    const c = t.patch;
    const cx = Math.floor(wx / c), cy = Math.floor(wy / c), cz = Math.floor(wz / c);
    const useCell = hash01(cx, cy, cz, t.seed + 11) < 0.75;
    const r = useCell ? hash01(cx, cy, cz, t.seed + 23) : hash01(wx, wy, wz, t.seed + 37);
    for (let i = 0; i < cum.length; i++) if (r < cum[i].c) return cum[i].id;
    return cum[cum.length - 1].id;
  }
}

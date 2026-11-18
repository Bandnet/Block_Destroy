import { WORLD_HEIGHT } from '../world/constants.js';
import { chunkKey } from '../world/World.js';
import { MATERIAL_TABLE } from '../data/materials.js';
import { sphereOffsets, columnOffsets } from './offsets.js';

/**
 * Block destruction logic. No rendering here.
 *
 * - Damage is stored per block (Chunk.damage), so progress survives looking away.
 * - Area effects (multibreak, drills, sphere tools) damage every block around the
 *   struck block, so total damage always scales linearly with the area.
 * - Every strike produces at most ONE 'blocksBroken' batch event, however many
 *   blocks it destroyed. Systems consume the batch (counts, reward, a few sample
 *   positions) so late-game mass destruction stays cheap.
 *
 * The batch object is reused: handlers must read it synchronously and not keep it.
 */

export const BASE_STATS = Object.freeze({
  damage: 4,
  hitsPerSecond: 2,
  critChance: 0,
  critMult: 2,
  areaRadius: 0,
  areaFraction: 0.25,
  columnRadius: 0,
  columnDepth: 0,
  columnFraction: 0.5,
  magnetRadius: 3,
  magnetSpeed: 8,
  rewardMul: 1,
  luckChance: 0,
  luckMult: 3,
  jackpotChance: 0,
  jackpotMult: 25,
  autoFraction: 0,
  autoRate: 0,
  autoRadius: 0,
});

const SAMPLE_MAX = 24;
const MAX_TICKS_PER_FRAME = 6;

function createBatch() {
  return {
    count: 0,
    reward: 0,
    counts: new Float64Array(16), // blocks broken per material id
    rewardBy: new Float64Array(16), // resources earned per material id
    samples: new Float32Array(SAMPLE_MAX * 4), // x, y, z, id
    sampleCount: 0,
    crit: false,
    manual: true,
    lucky: 0,
    jackpots: 0,
    maxId: 0,
  };
}

export class MiningSystem {
  constructor(world, events) {
    this.world = world;
    this.events = events;
    this.stats = { ...BASE_STATS };
    this.now = () => performance.now();

    this.target = null; // { x, y, z, id } currently looked-at block
    this.active = false; // true while mining this frame

    this.totalStrikes = 0;
    this.totalCrits = 0;

    this._hitAcc = 0;
    this._autoAcc = 0;
    this._autoTarget = null;
    this._autoScan = 0;
    this._batch = createBatch();
    this._rolling = false;
  }

  setStats(stats) {
    this.stats = stats;
  }

  get damagePerSecond() {
    return this.stats.damage * this.stats.hitsPerSecond;
  }

  /** Damage already dealt to the current target block. */
  get targetDamage() {
    const t = this.target;
    if (!t) return 0;
    const chunk = this.world.chunks.get(chunkKey(t.x >> 4, t.y >> 4, t.z >> 4));
    if (!chunk || !chunk.damage) return 0;
    return chunk.damage.get((((t.y & 15) * 16) + (t.z & 15)) * 16 + (t.x & 15)) || 0;
  }

  /** 0..1 progress on the current target. */
  get progress() {
    const t = this.target;
    if (!t) return 0;
    const mat = MATERIAL_TABLE[t.id];
    return mat ? Math.min(1, this.targetDamage / mat.maxHealth) : 0;
  }

  /**
   * @param dt     seconds since last update
   * @param hit    crosshair raycast result or null
   * @param mining true while the mine button is held
   * @param eye    {x,y,z} player eye position (used by auto-mining)
   */
  update(dt, hit, mining, eye) {
    this.active = false;

    if (!hit) {
      this.target = null;
    } else if (!this.target || this.target.x !== hit.x || this.target.y !== hit.y || this.target.z !== hit.z) {
      this.target = { x: hit.x, y: hit.y, z: hit.z, id: hit.id };
    }

    const s = this.stats;

    if (mining && hit) {
      this.active = true;
      this._hitAcc += dt * s.hitsPerSecond;
      let ticks = 0;
      while (this._hitAcc >= 1 && ticks < MAX_TICKS_PER_FRAME) {
        this._hitAcc -= 1;
        ticks++;
        const brokeTarget = this._strike(hit.x, hit.y, hit.z, s.damage, true);
        if (brokeTarget) {
          this.target = null;
          break; // the next frame re-targets; keep leftover progress below
        }
      }
      if (this._hitAcc > 1) this._hitAcc = 1;
    } else if (this._hitAcc > 1) {
      this._hitAcc = 1;
    }

    if (s.autoFraction > 0 && s.autoRate > 0 && eye) this._autoMine(dt, eye);
  }

  // ---------- auto mining ----------

  _autoMine(dt, eye) {
    const s = this.stats;
    this._autoAcc += dt * s.autoRate;
    this._autoScan -= dt;

    let ticks = 0;
    while (this._autoAcc >= 1 && ticks < 4) {
      this._autoAcc -= 1;
      ticks++;
      const t = this._autoTarget;
      if (!t || this._autoScan <= 0 || this.world.getBlock(t.x, t.y, t.z) === 0) {
        this._autoTarget = this._findNearestBlock(eye, s.autoRadius);
        this._autoScan = 0.4;
      }
      const target = this._autoTarget;
      if (!target) {
        this._autoAcc = 0;
        break;
      }
      this._strike(target.x, target.y, target.z, s.damage * s.autoFraction, false);
    }
    if (this._autoAcc > 1) this._autoAcc = 1;
  }

  _findNearestBlock(eye, radius) {
    const ex = Math.floor(eye.x);
    const ey = Math.floor(eye.y);
    const ez = Math.floor(eye.z);
    const offs = sphereOffsets(Math.max(1, radius));
    for (let i = 0; i < offs.length; i += 3) {
      const x = ex + offs[i];
      const y = ey + offs[i + 1];
      const z = ez + offs[i + 2];
      if (this.world.getBlock(x, y, z) !== 0) return { x, y, z };
    }
    return null;
  }

  // ---------- strikes ----------

  /**
   * One tool hit centred on (x,y,z). Returns true if the centre block was destroyed.
   */
  strike(x, y, z, damage, manual = true) {
    return this._strike(x, y, z, damage, manual);
  }

  _strike(x, y, z, damage, manual) {
    const s = this.stats;
    const centreId = this.world.getBlock(x, y, z);
    if (centreId === 0) return false;

    const crit = s.critChance > 0 && Math.random() < s.critChance;
    if (crit) {
      damage *= s.critMult;
      this.totalCrits++;
    }
    this.totalStrikes++;

    this._beginBatch(crit, manual);
    const world = this.world;

    const broke = this._damage(x, y, z, damage);

    if (manual && s.areaRadius > 0) {
      const d = damage * s.areaFraction;
      const offs = sphereOffsets(s.areaRadius);
      for (let i = 3; i < offs.length; i += 3) {
        const bx = x + offs[i], by = y + offs[i + 1], bz = z + offs[i + 2];
        if (world.getBlock(bx, by, bz) !== 0) this._damage(bx, by, bz, d);
      }
    }

    if (manual && s.columnRadius > 0 && s.columnDepth > 0) {
      const d = damage * s.columnFraction;
      const offs = columnOffsets(s.columnRadius, s.columnDepth);
      for (let i = 0; i < offs.length; i += 3) {
        if (offs[i] === 0 && offs[i + 1] === 0 && offs[i + 2] === 0) continue;
        const bx = x + offs[i], by = y + offs[i + 1], bz = z + offs[i + 2];
        if (world.getBlock(bx, by, bz) !== 0) this._damage(bx, by, bz, d);
      }
    }

    const b = this._batch;
    this.events.emit('strike', { x, y, z, id: centreId, crit, manual, damage });
    if (b.count > 0) this.events.emit('blocksBroken', b);
    this._rolling = false;
    return broke;
  }

  _beginBatch(crit, manual) {
    const b = this._batch;
    b.count = 0;
    b.reward = 0;
    b.counts.fill(0);
    b.rewardBy.fill(0);
    b.sampleCount = 0;
    b.crit = crit;
    b.manual = manual;
    b.lucky = 0;
    b.jackpots = 0;
    b.maxId = 0;
    this._rolling = true;
  }

  /** Apply damage to one block; returns true if it broke. */
  _damage(x, y, z, amount) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const chunk = this.world.chunks.get(chunkKey(x >> 4, y >> 4, z >> 4));
    if (!chunk) return false;
    const idx = (((y & 15) * 16) + (z & 15)) * 16 + (x & 15);
    const id = chunk.blocks[idx];
    if (id === 0) return false;
    const mat = MATERIAL_TABLE[id];
    if (!mat) return false;

    let total = amount;
    const dm = chunk.damage;
    if (dm !== null) {
      const prev = dm.get(idx);
      if (prev !== undefined) total += prev;
    }

    if (total >= mat.maxHealth) {
      if (dm !== null) dm.delete(idx);
      this.world.setBlock(x, y, z, 0);
      chunk.lastBreak = this.now();
      this._record(x, y, z, id, mat);
      return true;
    }

    if (dm === null) chunk.damage = new Map();
    chunk.damage.set(idx, total);
    return false;
  }

  _record(x, y, z, id, mat) {
    const s = this.stats;
    const b = this._batch;

    let reward = mat.reward * s.rewardMul;
    if (s.jackpotChance > 0 || s.luckChance > 0) {
      const r = Math.random();
      if (r < s.jackpotChance) {
        reward *= s.jackpotMult;
        b.jackpots++;
      } else if (r < s.jackpotChance + s.luckChance) {
        reward *= s.luckMult;
        b.lucky++;
      }
    }

    b.reward += reward;
    b.rewardBy[id] += reward;
    b.counts[id]++;
    if (id > b.maxId) b.maxId = id;

    // Reservoir sample of broken positions for particles and sound.
    const n = b.count++;
    if (n < SAMPLE_MAX) {
      const o = n * 4;
      b.samples[o] = x; b.samples[o + 1] = y; b.samples[o + 2] = z; b.samples[o + 3] = id;
      b.sampleCount = n + 1;
    } else {
      const j = Math.floor(Math.random() * (n + 1));
      if (j < SAMPLE_MAX) {
        const o = j * 4;
        b.samples[o] = x; b.samples[o + 1] = y; b.samples[o + 2] = z; b.samples[o + 3] = id;
      }
    }
  }
}

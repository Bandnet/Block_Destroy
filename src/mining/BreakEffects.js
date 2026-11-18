import * as THREE from 'three';
import { MATERIAL_TABLE } from '../data/materials.js';
import { KIND } from './ParticlePool.js';

const colorCache = new Map();
const tmp = new THREE.Color();

/** Debris palette as linear-space RGB (instance colours are not colour-managed). */
export function palette(id) {
  let p = colorCache.get(id);
  if (p) return p;
  const mat = MATERIAL_TABLE[id];
  const list = mat ? mat.debris : ['#ffffff'];
  p = list.map((hex) => {
    tmp.set(hex);
    return [tmp.r, tmp.g, tmp.b];
  });
  colorCache.set(id, p);
  return p;
}

const MAX_SPAWNS_PER_FRAME = 90;

/**
 * Spawns debris, the "pop" animation and hit chips for breaks and strikes, and
 * requests camera shake. Spawning is budgeted per frame so a mass break costs
 * about the same as a single one.
 */
export class BreakEffects {
  constructor({ events, particles, highlight }) {
    this.particles = particles;
    this.highlight = highlight;
    this.events = events;
    this.budget = MAX_SPAWNS_PER_FRAME;
    this._lastChip = 0;

    events.on('blocksBroken', (b) => this._onBreak(b));
    events.on('strike', (s) => this._onStrike(s));
  }

  update() {
    this.budget = MAX_SPAWNS_PER_FRAME;
  }

  _onBreak(b) {
    const p = this.particles;
    const n = b.sampleCount;
    const single = b.count === 1;
    const debrisPer = single ? 14 : Math.max(2, Math.floor(40 / Math.max(1, n)));

    for (let i = 0; i < n && this.budget > 0; i++) {
      const o = i * 4;
      const x = b.samples[o] + 0.5, y = b.samples[o + 1] + 0.5, z = b.samples[o + 2] + 0.5;
      const pal = palette(b.samples[o + 3]);
      const [pr, pg, pb] = pal[0];
      // The shrinking block only for small breaks; mass breaks would be a wall of cubes.
      if (b.count <= 8) {
        p.spawnPop(x, y, z, pr, pg, pb);
        this.budget--;
      }
      for (let k = 0; k < debrisPer && this.budget > 0; k++) {
        const c = pal[(Math.random() * pal.length) | 0];
        p.spawnDebris(x, y, z, c[0], c[1], c[2], single ? 1 : 1.5);
        this.budget--;
      }
    }

    // Camera shake grows with how much just broke
    const shake = b.count <= 1 ? 0.0 : Math.min(0.12, 0.012 * Math.log2(b.count + 1));
    if (shake > 0) this.events.emit('shake', shake);
    if (b.crit) this.events.emit('shake', 0.04);
  }

  _onStrike(s) {
    this.highlight.pulse();
    const now = performance.now();
    if (now - this._lastChip < 55 || this.budget < 4) return;
    this._lastChip = now;
    const pal = palette(s.id);
    for (let k = 0; k < (s.crit ? 6 : 2); k++) {
      const c = pal[(Math.random() * pal.length) | 0];
      this.particles.spawnDebris(s.x + 0.5, s.y + 0.5, s.z + 0.5, c[0], c[1], c[2], 0.6);
      this.budget--;
    }
  }
}

export { KIND };
